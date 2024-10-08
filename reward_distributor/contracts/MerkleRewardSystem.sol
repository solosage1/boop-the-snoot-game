// SPDX-License-Identifier: Business Source License 1.1
pragma solidity ^0.8.17;

import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";

contract MerkleRewardSystem is ReentrancyGuard, Pausable, AccessControl {
    using SafeERC20 for IERC20;

    // Constants
    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");
    bytes32 public constant UPDATER_ROLE = keccak256("UPDATER_ROLE");
    uint256 public constant REWARD_PRECISION = 1e18;
    uint256 public constant MAX_CAMPAIGN_DURATION = 365 days;
    uint256 public constant CLAIM_EXPIRATION = 365 days;

    // Enums
    enum CampaignStatus { Active, Inactive }

    // Structs
    struct Campaign {
        address creator;
        address rewardToken;
        address lpToken;
        uint256 maxRewardRate;
        uint256 startBlock;
        uint256 endBlock;
        uint256 totalRewards;
        uint256 claimedRewards;
    }

    // State variables
    mapping(uint256 => Campaign) public campaigns;
    mapping(address => bool) public whitelistedTokens;
    mapping(uint256 => address) public campaignToLPToken;
    mapping(address => uint256[]) public lpTokenToCampaigns;
    mapping(address => mapping(address => uint256)) public userTokenClaims;
    uint256 public totalCampaigns;
    uint256 public maxTokensPerBatch;

    bytes32 public globalMerkleRoot;
    uint256 public lastUpdateBlock;

    // Events
    event CampaignCreated(uint256 indexed campaignId, address indexed creator, address rewardToken, address lpToken, uint256 maxRewardRate, uint256 startBlock, uint256 endBlock, uint256 totalRewards);
    event GlobalRootUpdated(bytes32 newRoot, uint256 updateBlock);
    event TokenWhitelisted(address indexed token);
    event TokenWhitelistRemoved(address indexed token);
    event MaxRewardRateIncreased(uint256 indexed campaignId, uint256 newMaxRate);
    event RewardTokensDeposited(uint256 indexed campaignId, address indexed depositor, uint256 amount);
    event RewardTokensWithdrawn(uint256 indexed campaignId, address indexed recipient, uint256 amount);
    event BatchRewardsClaimed(address indexed user, address[] tokens, uint256[] amounts);
    event SingleRewardClaimed(address indexed user, address token, uint256 amount);

    // Error definitions
    error InvalidRewardToken();
    error InvalidLPToken();
    error InvalidCampaignDuration();
    error InvalidStartBlock();
    error UnauthorizedAccess();
    error InvalidMaxRate();
    error CampaignEnded();
    error InvalidUpdateBlock();
    error InvalidInputArrayLengths();
    error ClaimNotAllowed();
    error InvalidProof();
    error ExceedsEntitlement();
    error InsufficientRewardBalance();
    error CampaignNotEnded();
    error InsufficientBalance();
    error TokenAlreadyWhitelisted();
    error TokenNotWhitelisted();
    error TooManyTokens();

    constructor() {
        _setupRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _setupRole(ADMIN_ROLE, msg.sender);
        maxTokensPerBatch = 5; // Set initial value
    }

    function createCampaign(
        address rewardToken,
        address lpToken,
        uint256 maxRewardRate,
        uint256 startBlock,
        uint256 endBlock,
        uint256 totalRewardAmount
    ) external whenNotPaused nonReentrant {
        if (!whitelistedTokens[rewardToken]) revert InvalidRewardToken();
        if (lpToken == address(0)) revert InvalidLPToken();
        if (endBlock <= startBlock || endBlock > startBlock + MAX_CAMPAIGN_DURATION) revert InvalidCampaignDuration();
        if (startBlock < block.number) revert InvalidStartBlock();

        uint256 campaignId = totalCampaigns++;
        campaigns[campaignId] = Campaign({
            creator: msg.sender,
            rewardToken: rewardToken,
            lpToken: lpToken,
            maxRewardRate: maxRewardRate,
            startBlock: startBlock,
            endBlock: endBlock,
            totalRewards: totalRewardAmount,
            claimedRewards: 0
        });

        campaignToLPToken[campaignId] = lpToken;
        lpTokenToCampaigns[lpToken].push(campaignId);

        IERC20(rewardToken).safeTransferFrom(msg.sender, address(this), totalRewardAmount);

        emit CampaignCreated(campaignId, msg.sender, rewardToken, lpToken, maxRewardRate, startBlock, endBlock, totalRewardAmount);
        emit RewardTokensDeposited(campaignId, msg.sender, totalRewardAmount);
    }

    function depositRewards(uint256 campaignId, uint256 amount) external nonReentrant {
        Campaign storage campaign = campaigns[campaignId];
        if (msg.sender != campaign.creator) revert UnauthorizedAccess();
        if (block.number >= campaign.endBlock) revert CampaignEnded();

        IERC20(campaign.rewardToken).safeTransferFrom(msg.sender, address(this), amount);
        campaign.totalRewards += amount;

        emit RewardTokensDeposited(campaignId, msg.sender, amount);
    }

    function increaseMaxRewardRate(uint256 campaignId, uint256 newMaxRate) external {
        Campaign storage campaign = campaigns[campaignId];
        if (msg.sender != campaign.creator) revert UnauthorizedAccess();
        if (newMaxRate <= campaign.maxRewardRate) revert InvalidMaxRate();
        if (block.number >= campaign.endBlock) revert CampaignEnded();

        campaign.maxRewardRate = newMaxRate;
        emit MaxRewardRateIncreased(campaignId, newMaxRate);
    }

    function updateGlobalRoot(bytes32 newRoot, uint256 updateBlock) external onlyRole(UPDATER_ROLE) {
        if (updateBlock <= lastUpdateBlock) revert InvalidUpdateBlock();

        globalMerkleRoot = newRoot;
        lastUpdateBlock = updateBlock;

        emit GlobalRootUpdated(newRoot, updateBlock);
    }

    function setMaxTokensPerBatch(uint256 newMaxTokensPerBatch) external onlyRole(ADMIN_ROLE) {
        if (newMaxTokensPerBatch == 0) revert("Max tokens per batch must be greater than 0");
        maxTokensPerBatch = newMaxTokensPerBatch;
    }

    function batchClaimRewards(
        address[] calldata tokens,
        uint256[] calldata totalEntitledAmounts,
        uint256[] calldata claimAmounts,
        bytes32[] calldata merkleProof
    ) external nonReentrant whenNotPaused {
        if (tokens.length > maxTokensPerBatch) revert TooManyTokens();
        if (tokens.length != totalEntitledAmounts.length || totalEntitledAmounts.length != claimAmounts.length) revert InvalidInputArrayLengths();

        bytes32 leaf = keccak256(abi.encodePacked(msg.sender, tokens, totalEntitledAmounts));
        if (!MerkleProof.verify(merkleProof, globalMerkleRoot, leaf)) revert InvalidProof();

        for (uint256 i = 0; i < tokens.length; i++) {
            address token = tokens[i];
            uint256 totalEntitled = totalEntitledAmounts[i];
            uint256 claimAmount = claimAmounts[i];
            uint256 alreadyClaimed = userTokenClaims[msg.sender][token];

            if (alreadyClaimed + claimAmount > totalEntitled) revert ExceedsEntitlement();

            userTokenClaims[msg.sender][token] = alreadyClaimed + claimAmount;
            IERC20(token).safeTransfer(msg.sender, claimAmount);
        }

        emit BatchRewardsClaimed(msg.sender, tokens, claimAmounts);
    }

    function claimSingleReward(
        address token,
        uint256 totalEntitledAmount,
        uint256 claimAmount,
        bytes32[] calldata merkleProof
    ) external nonReentrant whenNotPaused {
        bytes32 leaf = keccak256(abi.encodePacked(msg.sender, token, totalEntitledAmount));
        if (!MerkleProof.verify(merkleProof, globalMerkleRoot, leaf)) revert InvalidProof();

        uint256 alreadyClaimed = userTokenClaims[msg.sender][token];
        if (alreadyClaimed + claimAmount > totalEntitledAmount) revert ExceedsEntitlement();

        userTokenClaims[msg.sender][token] = alreadyClaimed + claimAmount;
        IERC20(token).safeTransfer(msg.sender, claimAmount);

        emit SingleRewardClaimed(msg.sender, token, claimAmount);
    }

    function withdrawRewardTokens(uint256 campaignId, uint256 amount) external nonReentrant {
        Campaign storage campaign = campaigns[campaignId];
        if (msg.sender != campaign.creator) revert UnauthorizedAccess();
        if (block.number <= campaign.endBlock) revert CampaignNotEnded();

        uint256 availableBalance = campaign.totalRewards - campaign.claimedRewards;
        if (amount > availableBalance) revert InsufficientBalance();

        campaign.totalRewards -= amount;
        IERC20(campaign.rewardToken).safeTransfer(msg.sender, amount);

        emit RewardTokensWithdrawn(campaignId, msg.sender, amount);
    }

    function whitelistToken(address token) external onlyRole(ADMIN_ROLE) {
        if (whitelistedTokens[token]) revert TokenAlreadyWhitelisted();
        whitelistedTokens[token] = true;
        emit TokenWhitelisted(token);
    }

    function removeWhitelistedToken(address token) external onlyRole(ADMIN_ROLE) {
        if (!whitelistedTokens[token]) revert TokenNotWhitelisted();
        whitelistedTokens[token] = false;
        emit TokenWhitelistRemoved(token);
    }

    function pause() external onlyRole(ADMIN_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(ADMIN_ROLE) {
        _unpause();
    }

    function getCampaignLPToken(uint256 campaignId) external view returns (address) {
        return campaignToLPToken[campaignId];
    }

    function getCampaignIds(uint256 startIndex, uint256 endIndex) external view returns (uint256[] memory) {
        require(startIndex < endIndex && endIndex <= totalCampaigns, "Invalid range");
        uint256[] memory ids = new uint256[](endIndex - startIndex);
        for (uint256 i = startIndex; i < endIndex; i++) {
            ids[i - startIndex] = i;
        }
        return ids;
    }

    function getCampaignStatus(uint256 campaignId) public view returns (CampaignStatus) {
        Campaign storage campaign = campaigns[campaignId];
        if (block.number >= campaign.startBlock && block.number <= campaign.endBlock) {
            return CampaignStatus.Active;
        } else {
            return CampaignStatus.Inactive;
        }
    }

    function getCampaignDetails(uint256 campaignId) external view returns (uint256 remainingBalance, uint256 maxRewardRate) {
        Campaign storage campaign = campaigns[campaignId];
        remainingBalance = campaign.totalRewards - campaign.claimedRewards;
        maxRewardRate = campaign.maxRewardRate;
    }

    function getCampaignTiming(uint256 campaignId) external view returns (uint256 startBlock, uint256 endBlock) {
        Campaign storage campaign = campaigns[campaignId];
        startBlock = campaign.startBlock;
        endBlock = campaign.endBlock;
    }

    function getCampaign(uint256 campaignId) external view returns (Campaign memory) {
        return campaigns[campaignId];
    }

    function getUserClaimedAmount(address user, address token) external view returns (uint256) {
        return userTokenClaims[user][token];
    }

    function getAvailableBalance(uint256 campaignId) external view returns (uint256) {
        Campaign storage campaign = campaigns[campaignId];
        return campaign.totalRewards - campaign.claimedRewards;
    }
}