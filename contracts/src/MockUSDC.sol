// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @title MockUSDC
/// @notice TESTNET ONLY. 6-decimal test stablecoin with a public faucet, used as the
///         settlement token for GpuHedger on Monad Testnet. It has no value.
contract MockUSDC is ERC20, Ownable {
    uint256 public constant MAX_FAUCET_AMOUNT = 1_000_000e6;

    uint256 public faucetAmount;
    uint256 public faucetCooldown;
    mapping(address => uint256) public lastFaucetAt;

    event FaucetUsed(address indexed to, uint256 amount);
    event FaucetAmountUpdated(uint256 amount);
    event FaucetCooldownUpdated(uint256 cooldown);

    error FaucetOnCooldown(uint256 availableAt);
    error InvalidFaucetAmount();
    error ZeroAddress();

    constructor(uint256 faucetAmount_) ERC20("GpuHedger Test USDC", "USDC") Ownable(msg.sender) {
        if (faucetAmount_ == 0 || faucetAmount_ > MAX_FAUCET_AMOUNT) revert InvalidFaucetAmount();
        faucetAmount = faucetAmount_;
    }

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    /// @notice Mint `faucetAmount` test USDC to the caller.
    function faucet() external {
        uint256 last = lastFaucetAt[msg.sender];
        if (faucetCooldown != 0 && last != 0 && block.timestamp < last + faucetCooldown) {
            revert FaucetOnCooldown(last + faucetCooldown);
        }
        lastFaucetAt[msg.sender] = block.timestamp;
        _mint(msg.sender, faucetAmount);
        emit FaucetUsed(msg.sender, faucetAmount);
    }

    function mint(address to, uint256 amount) external onlyOwner {
        if (to == address(0)) revert ZeroAddress();
        _mint(to, amount);
    }

    function setFaucetAmount(uint256 amount) external onlyOwner {
        if (amount == 0 || amount > MAX_FAUCET_AMOUNT) revert InvalidFaucetAmount();
        faucetAmount = amount;
        emit FaucetAmountUpdated(amount);
    }

    function setFaucetCooldown(uint256 cooldown) external onlyOwner {
        faucetCooldown = cooldown;
        emit FaucetCooldownUpdated(cooldown);
    }
}
