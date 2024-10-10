// SPDX-License-Identifier: Business Source License 1.1

pragma solidity ^0.8.17;

import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";

contract BoopTheSnoot is ReentrancyGuard, Pausable, AccessControl {
    using SafeERC20 for IERC20;

    // Constants
    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");
    bytes32 public constant UPDATER_ROLE = keccak256("UPDATER_ROLE");
    uint256 public constant REWARD_PRECISION = 1e18;
    uint256 public constant CHANGE_DELAY = 3 days;

    // State variables (previously constants, now changeable)
    uint256 public MAX_CAMPAIGN_DURATION = 365 days;
    uint256 public CREATOR_WITHDRAW_COOLDOWN = 30 days;
    uint256 public ADMIN_WITHDRAW_COOLDOWN = 90 days;
    uint256 public maxTokensPerBatch = 50;

    // Referral Program State Variables
    mapping(address => address) public referrerOf;     // Maps a referee to their referrer
    mapping(address => address[]) public referees;     // Maps a referrer to their list of referees
    mapping(bytes32 => bool) public claimedBudgets;    // Tracks claimed referral rewards

    // Enums and Structs
    enum RewardType { Game, Referral }

    struct RewardClaim {
        uint256 campaignId;    // Relevant for Game rewards; set to 0 for Referral rewards
        address user;
        uint256 amount;
        RewardType rewardType;
    }

    struct Campaign {
        address creator;
        address rewardToken;
        address lpToken;
        uint256 maxRewardRate;
        uint256 startTimestamp;
        uint256 endTimestamp;
        uint256 totalRewards;
        uint256 claimedRewards;
        bool adminWithdrawn;
    }

    struct PendingChange {
        uint256 newValue;
        uint256 effectiveTime;
    }

    // State variables
    mapping(uint256 => Campaign) public campaigns;
    mapping(address => bool) public whitelistedTokens;
    mapping(uint256 => mapping(address => uint256)) public userClaims;
    bytes32 public globalMerkleRoot;
    uint256 public lastUpdateTimestamp;
    uint256 public campaignCount;
    mapping(address => uint256) public minLpTokenAmounts;
    mapping(bytes32 => PendingChange) public pendingChanges;

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
    event RewardsClaimed(address indexed user, uint256 indexed campaignId, uint256 amount);
    event UnclaimedRewardsWithdrawn(uint256 indexed campaignId, uint256 amount, address indexed recipient);
    event MinLpTokenAmountUpdated(address indexed lpToken, uint256 amount);
    event TotalRewardsClaimed(address indexed user, uint256 totalAmount);
    event ChangeProposed(string changeType, uint256 newValue, uint256 effectiveTime);
    event ChangeExecuted(string changeType, uint256 newValue);

    // Referral Events
    event ReferralMade(address indexed referrer, address indexed referee, uint256 lpTokenAmount);
    event ReferralFailed(address indexed referrer, address indexed referee, string reason);

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
    error ExceedsMaxTokensPerBatch();
    error AdminWithdrawalAlreadyDone();
    error CooldownPeriodNotPassed();
    error InvalidCumulativeAmount();
    error InsufficientLpTokenBalance();
    error InvalidParameterValue();
    error InvalidCooldownPeriods();
    error InvalidReferralInput();
    error BatchSizeTooLarge();
    error SelfReferralNotAllowed();
    error UserAlreadyReferred();

    // Modifiers
    modifier onlyCreator(uint256 campaignId) {
        if (campaigns[campaignId].creator != msg.sender) {
            revert UnauthorizedAccess();
        }
        _;
    }

    /**
     * @dev Constructor that sets up roles.
     */
    constructor() {
        _setupRole(DEFAULT_ADMIN_ROLE, msg.sender); // Grant DEFAULT_ADMIN_ROLE to deployer
        _setupRole(ADMIN_ROLE, msg.sender);         // Optionally, grant ADMIN_ROLE to deployer as well
    }

    /**
     * @dev Function to create a new campaign.
     */
    function createCampaign(
        address rewardToken,
        address lpToken,
        uint256 maxRewardRate,
        uint256 startTimestamp,
        uint256 endTimestamp,
        uint256 totalRewards
    ) external nonReentrant whenNotPaused {
        if (!whitelistedTokens[rewardToken]) revert InvalidRewardToken();
        if (!whitelistedTokens[lpToken]) revert InvalidLPToken();

        if (endTimestamp <= startTimestamp) revert InvalidCampaignDuration();
        if (endTimestamp - startTimestamp > MAX_CAMPAIGN_DURATION) revert InvalidCampaignDuration();

        if (startTimestamp < block.timestamp) revert InvalidStartTimestamp();

        if (maxRewardRate == 0) revert InvalidMaxRate();

        // Transfer reward tokens to the contract
        IERC20(rewardToken).safeTransferFrom(msg.sender, address(this), totalRewards);

        Campaign storage campaign = campaigns[campaignCount];
        campaign.creator = msg.sender;
        campaign.rewardToken = rewardToken;
        campaign.lpToken = lpToken;
        campaign.maxRewardRate = maxRewardRate;
        campaign.startTimestamp = startTimestamp;
        campaign.endTimestamp = endTimestamp;
        campaign.totalRewards = totalRewards;
        campaign.claimedRewards = 0;
        campaign.adminWithdrawn = false;

        emit CampaignCreated(
            campaignCount,
            msg.sender,
            rewardToken,
            lpToken,
            maxRewardRate,
            startTimestamp,
            endTimestamp,
            totalRewards
        );

        campaignCount++;
    }

    /**
     * @dev Function to update the global Merkle root for reward claims.
     */
    function updateGlobalRoot(bytes32 newRoot) external onlyRole(UPDATER_ROLE) whenNotPaused {
        globalMerkleRoot = newRoot;
        lastUpdateTimestamp = block.timestamp;
        emit GlobalRootUpdated(newRoot, block.timestamp);
    }

    /**
     * @dev Function to claim rewards (both game and referral rewards).
     */
    function claimRewards(
        RewardClaim[] calldata rewards,
        bytes32[][] calldata merkleProofs
    ) external nonReentrant whenNotPaused {
        uint256 numClaims = rewards.length;
        if (numClaims == 0) revert InvalidInputArrayLengths();
        if (numClaims != merkleProofs.length) revert InvalidInputArrayLengths();
        if (numClaims > maxTokensPerBatch) revert ExceedsMaxTokensPerBatch();

        uint256 totalClaimAmount = 0;

        for (uint256 i = 0; i < numClaims; i++) {
            RewardClaim calldata reward = rewards[i];
            bytes32[] calldata proof = merkleProofs[i];

            if (reward.rewardType == RewardType.Game) {
                _claimGameReward(reward.campaignId, reward.user, reward.amount, proof);
            } else if (reward.rewardType == RewardType.Referral) {
                _claimReferralReward(reward.user, reward.amount, proof);
            }
        }

        emit TotalRewardsClaimed(msg.sender, totalClaimAmount);
    }

    /**
     * @dev Internal function to handle game reward claims.
     */
    function _claimGameReward(
        uint256 campaignId,
        address user,
        uint256 amount,
        bytes32[] calldata proof
    ) internal {
        Campaign storage campaign = campaigns[campaignId];

        if (block.timestamp < campaign.startTimestamp) revert ClaimNotAllowed();

        bytes32 leaf = keccak256(abi.encodePacked(campaignId, user, amount, "game"));
        if (!MerkleProof.verify(proof, globalMerkleRoot, leaf)) revert InvalidProof();

        uint256 alreadyClaimed = userClaims[campaignId][user];
        if (amount <= alreadyClaimed) revert InvalidCumulativeAmount();

        uint256 claimableAmount = amount - alreadyClaimed;
        if (claimableAmount == 0) revert InvalidCumulativeAmount();

        if (campaign.totalRewards - campaign.claimedRewards < claimableAmount) revert InsufficientRewardBalance();

        userClaims[campaignId][user] = amount;
        campaign.claimedRewards += claimableAmount;

        IERC20(campaign.rewardToken).safeTransfer(user, claimableAmount);

        emit RewardsClaimed(user, campaignId, claimableAmount);
    }

    /**
     * @dev Internal function to handle referral reward claims.
     */
    function _claimReferralReward(
        address user,
        uint256 amount,
        bytes32[] calldata proof
    ) internal {
        bytes32 leaf = keccak256(abi.encodePacked(user, amount, "referral"));
        if (!MerkleProof.verify(proof, globalMerkleRoot, leaf)) revert InvalidProof();

        if (claimedBudgets[leaf]) revert ExceedsEntitlement();
        claimedBudgets[leaf] = true;

        // Transfer referral rewards to the user
        IERC20(campaigns[0].rewardToken).safeTransfer(user, amount);

        emit RewardsClaimed(user, 0, amount); // campaignId 0 indicates referral reward
    }

    /**
     * @dev Function to make referrals.
     */
    function makeReferral(address[] calldata _referees, uint256[] calldata _lpAmounts) external nonReentrant whenNotPaused {
        if (_referees.length != _lpAmounts.length) revert InvalidReferralInput();
        if (_referees.length > maxTokensPerBatch) revert BatchSizeTooLarge();

        for (uint256 i = 0; i < _referees.length; i++) {
            address referee = _referees[i];
            uint256 lpAmount = _lpAmounts[i];

            if (referee == msg.sender) revert SelfReferralNotAllowed();
            if (referrerOf[referee] != address(0)) revert UserAlreadyReferred();

            IERC20(campaigns[0].lpToken).safeTransferFrom(msg.sender, referee, lpAmount);
            referrerOf[referee] = msg.sender;
            referees[msg.sender].push(referee);
            emit ReferralMade(msg.sender, referee, lpAmount);
        }
    }

    /**
     * @dev Function to whitelist a token. Only callable by accounts with ADMIN_ROLE.
     */
    function whitelistToken(address token) external onlyRole(ADMIN_ROLE) {
        if (whitelistedTokens[token]) revert TokenAlreadyWhitelisted();
        whitelistedTokens[token] = true;
        emit TokenWhitelisted(token);
    }

    /**
     * @dev Function to remove a token from the whitelist.
     */
    function removeWhitelistedToken(address token) external onlyRole(ADMIN_ROLE) {
        if (!whitelistedTokens[token]) revert TokenNotWhitelisted();
        whitelistedTokens[token] = false;
        emit TokenWhitelistRemoved(token);
    }

    /**
     * @dev Function to set minimum LP token amounts.
     */
    function setMinLpTokenAmount(address lpToken, uint256 amount) external onlyRole(ADMIN_ROLE) {
        minLpTokenAmounts[lpToken] = amount;
        emit MinLpTokenAmountUpdated(lpToken, amount);
    }

    /**
     * @dev Function to increase the max reward rate of a campaign.
     */
    function increaseMaxRewardRate(uint256 campaignId, uint256 newMaxRate) external onlyCreator(campaignId) {
        if (newMaxRate <= campaigns[campaignId].maxRewardRate) revert InvalidMaxRate();
        campaigns[campaignId].maxRewardRate = newMaxRate;
        emit MaxRewardRateIncreased(campaignId, newMaxRate);
    }

    /**
     * @dev Function to deposit additional reward tokens to a campaign.
     */
    function depositRewardTokens(uint256 campaignId, uint256 amount) external nonReentrant onlyCreator(campaignId) {
        IERC20(campaigns[campaignId].rewardToken).safeTransferFrom(msg.sender, address(this), amount);
        campaigns[campaignId].totalRewards += amount;
        emit RewardTokensDeposited(campaignId, msg.sender, amount);
    }

    /**
     * @dev Function to withdraw unclaimed rewards after campaign ends.
     */
    function withdrawUnclaimedRewards(uint256 campaignId) external nonReentrant onlyCreator(campaignId) {
        Campaign storage campaign = campaigns[campaignId];
        if (block.timestamp < campaign.endTimestamp + CREATOR_WITHDRAW_COOLDOWN) revert CooldownPeriodNotPassed();
        uint256 unclaimedRewards = campaign.totalRewards - campaign.claimedRewards;
        if (unclaimedRewards == 0) revert InsufficientRewardBalance();
        campaign.totalRewards = campaign.claimedRewards;
        IERC20(campaign.rewardToken).safeTransfer(msg.sender, unclaimedRewards);
        emit UnclaimedRewardsWithdrawn(campaignId, unclaimedRewards, msg.sender);
    }

    /**
     * @dev Function for admin to withdraw unclaimed rewards after longer cooldown.
     */
    function adminWithdrawUnclaimedRewards(uint256 campaignId) external nonReentrant onlyRole(ADMIN_ROLE) {
        Campaign storage campaign = campaigns[campaignId];
        if (campaign.adminWithdrawn) revert AdminWithdrawalAlreadyDone();
        if (block.timestamp < campaign.endTimestamp + ADMIN_WITHDRAW_COOLDOWN) revert CooldownPeriodNotPassed();
        uint256 unclaimedRewards = campaign.totalRewards - campaign.claimedRewards;
        if (unclaimedRewards == 0) revert InsufficientRewardBalance();
        campaign.adminWithdrawn = true;
        campaign.totalRewards = campaign.claimedRewards;
        IERC20(campaign.rewardToken).safeTransfer(msg.sender, unclaimedRewards);
        emit UnclaimedRewardsWithdrawn(campaignId, unclaimedRewards, msg.sender);
    }

    /**
     * @dev Function to pause the contract (only ADMIN_ROLE).
     */
    function pause() external onlyRole(ADMIN_ROLE) {
        _pause();
    }

    /**
     * @dev Function to unpause the contract (only ADMIN_ROLE).
     */
    function unpause() external onlyRole(ADMIN_ROLE) {
        _unpause();
    }

    /**
     * @dev Function to propose changes to parameters.
     */
    function proposeParameterChange(string memory parameter, uint256 newValue) external onlyRole(ADMIN_ROLE) {
        if (newValue == 0) revert InvalidParameterValue();
        bytes32 changeId = keccak256(abi.encodePacked(parameter));
        pendingChanges[changeId] = PendingChange(newValue, block.timestamp + CHANGE_DELAY);
        emit ChangeProposed(parameter, newValue, block.timestamp + CHANGE_DELAY);
    }

    /**
     * @dev Function to execute proposed changes after delay.
     */
    function executeChange(string memory parameter) external onlyRole(ADMIN_ROLE) {
        bytes32 changeId = keccak256(abi.encodePacked(parameter));
        PendingChange memory change = pendingChanges[changeId];
        if (change.effectiveTime == 0) revert InvalidParameterValue();
        if (block.timestamp < change.effectiveTime) revert CooldownPeriodNotPassed();

        if (keccak256(abi.encodePacked(parameter)) == keccak256("MAX_CAMPAIGN_DURATION")) {
            MAX_CAMPAIGN_DURATION = change.newValue;
        } else if (keccak256(abi.encodePacked(parameter)) == keccak256("CREATOR_WITHDRAW_COOLDOWN")) {
            CREATOR_WITHDRAW_COOLDOWN = change.newValue;
        } else if (keccak256(abi.encodePacked(parameter)) == keccak256("ADMIN_WITHDRAW_COOLDOWN")) {
            ADMIN_WITHDRAW_COOLDOWN = change.newValue;
        } else if (keccak256(abi.encodePacked(parameter)) == keccak256("MAX_TOKENS_PER_BATCH")) {
            maxTokensPerBatch = change.newValue;
        } else {
            revert InvalidParameterValue();
        }

        delete pendingChanges[changeId];
        emit ChangeExecuted(parameter, change.newValue);
    }

    // Additional helper functions and modifiers as per your original contract
}