// SPDX-License-Identifier: Business Source License 1.1
/*
⠀⠀⠀⠀⠀⠀⠀⠀⠀⢀⣠⣶⣶⣶⣶⣶⣶⣶⣶⣶⣶⣶⣶⣶⣶⣶⣶⣤⣀⠀⠀⠀⠀⠀⠀⠀⠀⠀
⠀⠀⠀⠀⠀⠀⠀⢀⣴⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣷⡀⠀⠀⠀⠀⠀⠀
⠀⠀⠀⠀⠀⢀⣴⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣆⠀⠀⠀⠀⠀
⠀⠀⠀⠀⢠⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣧⠀⠀⠀⠀
⠀⠀⠀⠀⣾⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⡆⠀⠀⠀
⠀⠀⠀⣼⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⡄⠀⠀
⠀⠀⠀⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⠀⠀
⠀⠀⠀⢿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⠀⠀
⠀⠀⠀⠸⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⡿⠀⠀
⠀⠀⠀⠀⠻⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⡿⠃⠀⠀
⠀⠀⠀⠀⠀⠘⠻⢿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⡿⠟⠋⠀⠀
⠀⠀⠀⠀⠀⠀⠀⠀⠉⠛⠿⠿⠿⠿⢿⣿⣿⣿⣿⣿⣿⣿⣿⣿⠿⠿⠿⠿⠿⠿⠛⠉⠀⠀⠀⠀
⠀⠀⠀⠀⠀⠀⠀⠀ ⠀BoopTheSnoot Rewards
*/
// Business Source License 1.1
// Licensed Work: BoopTheSnoot Rewards
// Licensor: BoopTheSnoot
//
// [License text remains the same...]

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
    mapping(bytes32 => uint256) public userToCampaignClaimed; // Tracks the amount claimed per user per campaign
    mapping(address => uint256[]) public lpTokenToCampaigns; // Mapping from LP token to array of campaign IDs

    bytes32 public globalMerkleRoot;
    uint256 public lastUpdateBlock;
    uint256 public campaignCounter;

    // Events
    event CampaignCreated(
        uint256 indexed campaignId,
        address indexed creator,
        address rewardToken,
        address lpToken,
        uint256 maxRewardRate,
        uint256 startBlock,
        uint256 endBlock,
        uint256 totalRewards
    );
    event GlobalRootUpdated(bytes32 newRoot, uint256 updateBlock);
    event RewardClaimed(uint256 indexed campaignId, address indexed user, uint256 amount);
    event TokenWhitelisted(address indexed token);
    event TokenWhitelistRemoved(address indexed token);
    event MaxRewardRateIncreased(uint256 indexed campaignId, uint256 newMaxRate);
    event RewardTokensDeposited(uint256 indexed campaignId, address indexed depositor, uint256 amount);
    event RewardTokensWithdrawn(uint256 indexed campaignId, address indexed recipient, uint256 amount);

    // Error definitions grouped for clarity
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

    /**
     * @dev Constructor sets up the roles.
     */
    constructor() {
        _setupRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _setupRole(ADMIN_ROLE, msg.sender);
    }

    /**
     * @notice Creates a new campaign.
     * @param rewardToken The address of the reward token.
     * @param lpToken The address of the LP token.
     * @param maxRewardRate The maximum reward rate.
     * @param startBlock The block number when the campaign starts.
     * @param endBlock The block number when the campaign ends.
     * @param totalRewardAmount The total amount of rewards for the campaign.
     */
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

        uint256 campaignId = campaignCounter++;
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

        // Transfer the total reward amount from the creator to the contract
        IERC20(rewardToken).safeTransferFrom(msg.sender, address(this), totalRewardAmount);

        // Add campaign ID to the LP token's campaign list
        lpTokenToCampaigns[lpToken].push(campaignId);

        emit CampaignCreated(campaignId, msg.sender, rewardToken, lpToken, maxRewardRate, startBlock, endBlock, totalRewardAmount);
        emit RewardTokensDeposited(campaignId, msg.sender, totalRewardAmount);
    }

    /**
     * @notice Allows the campaign creator to deposit additional rewards.
     * @param campaignId The ID of the campaign.
     * @param amount The amount of rewards to deposit.
     */
    function depositRewards(uint256 campaignId, uint256 amount) external nonReentrant {
        Campaign storage campaign = campaigns[campaignId];
        if (msg.sender != campaign.creator) revert UnauthorizedAccess();
        if (block.number >= campaign.endBlock) revert CampaignEnded();

        // Transfer the reward tokens from the creator to the contract
        IERC20(campaign.rewardToken).safeTransferFrom(msg.sender, address(this), amount);

        // Update the total rewards for the campaign
        campaign.totalRewards += amount;

        emit RewardTokensDeposited(campaignId, msg.sender, amount);
    }

    /**
     * @notice Increases the maximum reward rate for a campaign.
     * @param campaignId The ID of the campaign.
     * @param newMaxRate The new maximum reward rate.
     */
    function increaseMaxRewardRate(uint256 campaignId, uint256 newMaxRate) external {
        Campaign storage campaign = campaigns[campaignId];
        if (msg.sender != campaign.creator) revert UnauthorizedAccess();
        if (newMaxRate <= campaign.maxRewardRate) revert InvalidMaxRate();
        if (block.number >= campaign.endBlock) revert CampaignEnded();

        campaign.maxRewardRate = newMaxRate;
        emit MaxRewardRateIncreased(campaignId, newMaxRate);
    }

    /**
     * @notice Updates the global Merkle root.
     * @param newRoot The new Merkle root.
     * @param updateBlock The block number of the update.
     */
    function updateGlobalRoot(
        bytes32 newRoot,
        uint256 updateBlock
    ) external onlyRole(UPDATER_ROLE) {
        if (updateBlock <= lastUpdateBlock) revert InvalidUpdateBlock();

        globalMerkleRoot = newRoot;
        lastUpdateBlock = updateBlock;

        emit GlobalRootUpdated(newRoot, updateBlock);
    }

    /**
     * @notice Claims reward tokens.
     * @param campaignId The ID of the campaign.
     * @param totalEntitledAmount The total amount the user is entitled to.
     * @param merkleProof The Merkle proof.
     * @param claimAmount The amount the user wants to claim.
     */
    function claimReward(
        uint256 campaignId,
        uint256 totalEntitledAmount,
        bytes32[] calldata merkleProof,
        uint256 claimAmount
    ) external nonReentrant whenNotPaused {
        Campaign storage campaign = campaigns[campaignId];
        if (block.number < campaign.startBlock || block.number >= campaign.endBlock + CLAIM_EXPIRATION) revert ClaimNotAllowed();

        bytes32 leaf = keccak256(abi.encodePacked(campaignId, msg.sender, totalEntitledAmount));
        if (!MerkleProof.verify(merkleProof, globalMerkleRoot, leaf)) revert InvalidProof();

        bytes32 claimId = keccak256(abi.encodePacked(campaignId, msg.sender));
        uint256 claimedSoFar = userToCampaignClaimed[claimId];

        // Check that total claimed does not exceed total entitled amount
        if (claimedSoFar + claimAmount > totalEntitledAmount) revert ExceedsEntitlement();

        // Update claimed amounts
        userToCampaignClaimed[claimId] = claimedSoFar + claimAmount;
        campaign.claimedRewards += claimAmount;

        if (campaign.claimedRewards > campaign.totalRewards) revert InsufficientRewardBalance();

        IERC20(campaign.rewardToken).safeTransfer(msg.sender, claimAmount);

        emit RewardClaimed(campaignId, msg.sender, claimAmount);
    }

    /**
     * @notice Withdraws unclaimed reward tokens after campaign end.
     * @param campaignId The ID of the campaign.
     * @param amount The amount to withdraw.
     */
    function withdrawRewardTokens(uint256 campaignId, uint256 amount) external nonReentrant {
        Campaign storage campaign = campaigns[campaignId];
        if (msg.sender != campaign.creator) revert UnauthorizedAccess();
        if (block.number <= campaign.endBlock) revert CampaignNotEnded();

        uint256 availableBalance = campaign.totalRewards - campaign.claimedRewards;
        if (amount > availableBalance) revert InsufficientBalance();

        // Update total rewards before external call
        campaign.totalRewards -= amount;

        IERC20(campaign.rewardToken).safeTransfer(msg.sender, amount);

        emit RewardTokensWithdrawn(campaignId, msg.sender, amount);
    }

    /**
     * @notice Whitelists a token.
     * @param token The address of the token to whitelist.
     */
    function whitelistToken(address token) external onlyRole(ADMIN_ROLE) {
        if (whitelistedTokens[token]) revert TokenAlreadyWhitelisted();
        whitelistedTokens[token] = true;
        emit TokenWhitelisted(token);
    }

    /**
     * @notice Removes a token from the whitelist.
     * @param token The address of the token to remove.
     */
    function removeWhitelistedToken(address token) external onlyRole(ADMIN_ROLE) {
        if (!whitelistedTokens[token]) revert TokenNotWhitelisted();
        whitelistedTokens[token] = false;
        emit TokenWhitelistRemoved(token);
    }

    /**
     * @notice Pauses the contract.
     */
    function pause() external onlyRole(ADMIN_ROLE) {
        _pause();
    }

    /**
     * @notice Unpauses the contract.
     */
    function unpause() external onlyRole(ADMIN_ROLE) {
        _unpause();
    }

    /**
     * @notice Gets campaigns by LP token and status.
     * @param lpToken The LP token address.
     * @param onlyActive If true, returns only active campaigns.
     * @return An array of campaign IDs.
     */
    function getCampaignsByLPToken(address lpToken, bool onlyActive) external view returns (uint256[] memory) {
        uint256[] storage campaignIds = lpTokenToCampaigns[lpToken];
        uint256[] memory tempArray = new uint256[](campaignIds.length);
        uint256 count = 0;

        for (uint256 i = 0; i < campaignIds.length; i++) {
            uint256 campaignId = campaignIds[i];
            CampaignStatus status = getCampaignStatus(campaignId);
            if (onlyActive && status == CampaignStatus.Active) {
                tempArray[count] = campaignId;
                count++;
            } else if (!onlyActive && status == CampaignStatus.Inactive) {
                tempArray[count] = campaignId;
                count++;
            }
        }

        // Resize the array to the correct length
        uint256[] memory result = new uint256[](count);
        for (uint256 i = 0; i < count; i++) {
            result[i] = tempArray[i];
        }
        return result;
    }

    /**
     * @notice Gets the status of a campaign.
     * @param campaignId The ID of the campaign.
     * @return The status of the campaign.
     */
    function getCampaignStatus(uint256 campaignId) public view returns (CampaignStatus) {
        Campaign storage campaign = campaigns[campaignId];
        if (block.number >= campaign.startBlock && block.number <= campaign.endBlock) {
            return CampaignStatus.Active;
        } else {
            return CampaignStatus.Inactive;
        }
    }

    /**
     * @notice Gets the remaining balance and max reward rate of a campaign.
     * @param campaignId The ID of the campaign.
     * @return remainingBalance The remaining balance.
     * @return maxRewardRate The maximum reward rate.
     */
    function getCampaignDetails(uint256 campaignId) external view returns (uint256 remainingBalance, uint256 maxRewardRate) {
        Campaign storage campaign = campaigns[campaignId];
        remainingBalance = campaign.totalRewards - campaign.claimedRewards;
        maxRewardRate = campaign.maxRewardRate;
    }

    /**
     * @notice Gets the start and end block of a campaign.
     * @param campaignId The ID of the campaign.
     * @return startBlock The start block.
     * @return endBlock The end block.
     */
    function getCampaignTiming(uint256 campaignId) external view returns (uint256 startBlock, uint256 endBlock) {
        Campaign storage campaign = campaigns[campaignId];
        startBlock = campaign.startBlock;
        endBlock = campaign.endBlock;
    }

    /**
     * @notice Gets the campaign details.
     * @param campaignId The ID of the campaign.
     * @return The campaign struct.
     */
    function getCampaign(uint256 campaignId) external view returns (Campaign memory) {
        return campaigns[campaignId];
    }

    /**
     * @notice Gets the claimed amount for a user in a campaign.
     * @param campaignId The ID of the campaign.
     * @param user The address of the user.
     * @return The claimed amount.
     */
    function getUserClaimedAmount(uint256 campaignId, address user) external view returns (uint256) {
        bytes32 claimId = keccak256(abi.encodePacked(campaignId, user));
        return userToCampaignClaimed[claimId];
    }

    /**
     * @notice Gets the available balance for a campaign.
     * @param campaignId The ID of the campaign.
     * @return The available balance.
     */
    function getAvailableBalance(uint256 campaignId) external view returns (uint256) {
        Campaign storage campaign = campaigns[campaignId];
        return campaign.totalRewards - campaign.claimedRewards;
    }
}
