// SPDX-License-Identifier: Business Source License 1.1

pragma solidity ^0.8.17;

import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";

contract MerkleRewardSystem is ReentrancyGuard, Pausable, AccessControl {
    using SafeERC20 for IERC20;

    // Constants
    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");
    bytes32 public constant UPDATER_ROLE = keccak256("UPDATER_ROLE");
    uint256 public constant REWARD_PRECISION = 1e18;
    uint256 public constant MAX_CAMPAIGN_DURATION = 365 days;
    uint256 public constant CREATOR_WITHDRAW_COOLDOWN = 30 days;
    uint256 public constant ADMIN_WITHDRAW_COOLDOWN = 90 days;

    // Structs
    struct Campaign {
        address creator;
        address rewardToken;
        address lpToken;
        uint256 maxRewardRate;
        uint256 startTimestamp;
        uint256 endTimestamp;
        uint256 totalRewards;
        uint256 claimedRewards;
        bool adminWithdrawn; // Tracks if admin has withdrawn unclaimed rewards
    }

    // State variables
    mapping(uint256 => Campaign) public campaigns;
    mapping(address => bool) public whitelistedTokens;
    mapping(uint256 => mapping(address => uint256)) public userClaims; // campaignId => user => amount claimed
    uint256 public totalCampaigns;
    uint256 public maxTokensPerBatch = 5; // Initial value set in constructor

    bytes32 public globalMerkleRoot;
    uint256 public lastUpdateTimestamp;

    // Events
    event CampaignCreated(
        uint256 indexed campaignId,
        address indexed creator,
        address rewardToken,
        address lpToken,
        uint256 maxRewardRate,
        uint256 startTimestamp,
        uint256 endTimestamp,
        uint256 totalRewards
    );
    event GlobalRootUpdated(bytes32 newRoot, uint256 updateTimestamp);
    event TokenWhitelisted(address indexed token);
    event TokenWhitelistRemoved(address indexed token);
    event MaxRewardRateIncreased(uint256 indexed campaignId, uint256 newMaxRate);
    event RewardTokensDeposited(uint256 indexed campaignId, address indexed depositor, uint256 amount);
    event RewardTokensWithdrawn(uint256 indexed campaignId, address indexed recipient, uint256 amount);
    event RewardsClaimed(address indexed user, uint256 totalAmount);
    event UnclaimedRewardsWithdrawn(uint256 indexed campaignId, uint256 amount, address indexed recipient);

    // Error definitions
    error InvalidRewardToken();
    error InvalidLPToken();
    error InvalidCampaignDuration();
    error InvalidStartTimestamp();
    error UnauthorizedAccess();
    error InvalidMaxRate();
    error CampaignEnded();
    error InvalidUpdateTimestamp();
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
    error AdminWithdrawalAlreadyDone();
    error CooldownPeriodNotPassed();

    constructor() {
        _setupRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _setupRole(ADMIN_ROLE, msg.sender);
        _setupRole(UPDATER_ROLE, msg.sender);
        maxTokensPerBatch = 5; // Set initial value
    }

    modifier onlyCreator(uint256 campaignId) {
        Campaign storage campaign = campaigns[campaignId];
        if (campaign.creator != msg.sender) revert UnauthorizedAccess();
        _;
    }

    function createCampaign(
        address rewardToken,
        address lpToken,
        uint256 maxRewardRate,
        uint256 startTimestamp,
        uint256 endTimestamp,
        uint256 totalRewardAmount
    ) external whenNotPaused nonReentrant {
        if (!whitelistedTokens[rewardToken]) revert InvalidRewardToken();
        if (lpToken == address(0)) revert InvalidLPToken();
        if (endTimestamp <= startTimestamp || endTimestamp > startTimestamp + MAX_CAMPAIGN_DURATION) revert InvalidCampaignDuration();
        if (startTimestamp < block.timestamp) revert InvalidStartTimestamp();

        uint256 campaignId = totalCampaigns++;
        campaigns[campaignId] = Campaign({
            creator: msg.sender,
            rewardToken: rewardToken,
            lpToken: lpToken,
            maxRewardRate: maxRewardRate,
            startTimestamp: startTimestamp,
            endTimestamp: endTimestamp,
            totalRewards: totalRewardAmount,
            claimedRewards: 0,
            adminWithdrawn: false
        });

        IERC20(rewardToken).safeTransferFrom(msg.sender, address(this), totalRewardAmount);

        emit CampaignCreated(campaignId, msg.sender, rewardToken, lpToken, maxRewardRate, startTimestamp, endTimestamp, totalRewardAmount);
        emit RewardTokensDeposited(campaignId, msg.sender, totalRewardAmount);
    }

    function updateGlobalRoot(bytes32 newRoot, uint256 updateTimestamp) external onlyRole(UPDATER_ROLE) {
        if (updateTimestamp <= lastUpdateTimestamp) revert InvalidUpdateTimestamp();

        globalMerkleRoot = newRoot;
        lastUpdateTimestamp = updateTimestamp;

        emit GlobalRootUpdated(newRoot, updateTimestamp);
    }

    function claimRewards(
        uint256[] calldata campaignIds,
        uint256[] calldata amounts,
        bytes32[][] calldata merkleProofs
    ) external nonReentrant whenNotPaused {
        uint256 numClaims = campaignIds.length;
        if (numClaims != amounts.length || numClaims != merkleProofs.length) revert InvalidInputArrayLengths();
        if (numClaims > maxTokensPerBatch) revert TooManyTokens();

        uint256 totalAmount = 0;

        for (uint256 i = 0; i < numClaims; i++) {
            uint256 campaignId = campaignIds[i];
            uint256 amount = amounts[i];

            Campaign storage campaign = campaigns[campaignId];

            if (block.timestamp < campaign.startTimestamp) revert ClaimNotAllowed();

            // Reconstruct the leaf
            bytes32 leaf = keccak256(abi.encodePacked(campaignId, msg.sender, amount));

            if (!MerkleProof.verify(merkleProofs[i], globalMerkleRoot, leaf)) revert InvalidProof();

            uint256 alreadyClaimed = userClaims[campaignId][msg.sender];
            if (alreadyClaimed + amount > campaign.maxRewardRate * REWARD_PRECISION) revert ExceedsEntitlement();
            if (campaign.totalRewards - campaign.claimedRewards < amount) revert InsufficientRewardBalance();

            userClaims[campaignId][msg.sender] = alreadyClaimed + amount;
            campaign.claimedRewards += amount;

            IERC20(campaign.rewardToken).safeTransfer(msg.sender, amount);
            totalAmount += amount;
        }

        emit RewardsClaimed(msg.sender, totalAmount);
    }

    function withdrawRewardTokens(uint256 campaignId, uint256 amount) external nonReentrant {
        Campaign storage campaign = campaigns[campaignId];
        if (msg.sender != campaign.creator) revert UnauthorizedAccess();
        if (block.timestamp <= campaign.endTimestamp + CREATOR_WITHDRAW_COOLDOWN) revert CooldownPeriodNotPassed();
        if (block.timestamp < campaign.endTimestamp) revert CampaignNotEnded();

        uint256 availableBalance = campaign.totalRewards - campaign.claimedRewards;
        if (amount > availableBalance) revert InsufficientBalance();

        campaign.totalRewards -= amount;
        IERC20(campaign.rewardToken).safeTransfer(msg.sender, amount);

        emit RewardTokensWithdrawn(campaignId, msg.sender, amount);
    }

    function withdrawUnclaimedRewards(uint256 campaignId) external nonReentrant onlyRole(ADMIN_ROLE) whenNotPaused {
        Campaign storage campaign = campaigns[campaignId];
        if (block.timestamp <= campaign.endTimestamp + ADMIN_WITHDRAW_COOLDOWN) revert CooldownPeriodNotPassed();
        if (campaign.adminWithdrawn) revert AdminWithdrawalAlreadyDone();
        if (block.timestamp < campaign.endTimestamp) revert CampaignNotEnded();

        uint256 unclaimed = campaign.totalRewards - campaign.claimedRewards;
        if (unclaimed == 0) revert InsufficientBalance();

        campaign.totalRewards -= unclaimed;
        campaign.adminWithdrawn = true;

        IERC20(campaign.rewardToken).safeTransfer(msg.sender, unclaimed);

        emit UnclaimedRewardsWithdrawn(campaignId, unclaimed, msg.sender);
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
        return campaigns[campaignId].lpToken;
    }

    function getCampaignIds(uint256 startIndex, uint256 endIndex) external view returns (uint256[] memory) {
        if (startIndex >= endIndex || endIndex > totalCampaigns) revert InvalidInputArrayLengths();
        uint256[] memory ids = new uint256[](endIndex - startIndex);
        for (uint256 i = startIndex; i < endIndex; i++) {
            ids[i - startIndex] = i;
        }
        return ids;
    }

    function getCampaignStatus(uint256 campaignId) public view returns (CampaignStatus) {
        Campaign storage campaign = campaigns[campaignId];
        if (block.timestamp >= campaign.startTimestamp && block.timestamp <= campaign.endTimestamp) {
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

    function getCampaignTiming(uint256 campaignId) external view returns (uint256 startTimestamp, uint256 endTimestamp) {
        Campaign storage campaign = campaigns[campaignId];
        startTimestamp = campaign.startTimestamp;
        endTimestamp = campaign.endTimestamp;
    }

    function getCampaign(uint256 campaignId) external view returns (Campaign memory) {
        return campaigns[campaignId];
    }

    function getUserClaimedAmount(uint256 campaignId, address user) external view returns (uint256) {
        return userClaims[campaignId][user];
    }

    function getAvailableBalance(uint256 campaignId) external view returns (uint256) {
        Campaign storage campaign = campaigns[campaignId];
        return campaign.totalRewards - campaign.claimedRewards;
    }

    enum CampaignStatus { Active, Inactive }

    function isTokenWhitelisted(address token) external view returns (bool) {
        return whitelistedTokens[token];
    }
}