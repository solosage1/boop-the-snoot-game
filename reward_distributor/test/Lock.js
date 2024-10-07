const { ethers, network } = require("hardhat");
const { expect } = require("chai");
const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");

describe("Lock", function () {
  async function deployOneYearLockFixture() {
    const ONE_YEAR_IN_SECS = 365 * 24 * 60 * 60;
    const ONE_ETHER = ethers.utils.parseEther("1");

    const lockedAmount = ONE_ETHER;
    const currentTimestamp = (await ethers.provider.getBlock('latest')).timestamp;
    const unlockTime = currentTimestamp + ONE_YEAR_IN_SECS;

    const [owner, otherAccount] = await ethers.getSigners();

    const Lock = await ethers.getContractFactory("Lock");
    const lock = await Lock.deploy(unlockTime, { value: lockedAmount });

    return { lock, unlockTime, lockedAmount, owner, otherAccount };
  }

  describe("Deployment", function () {
    it("Should set the right unlockTime", async function () {
      const { lock, unlockTime } = await loadFixture(deployOneYearLockFixture);

      expect(await lock.unlockTime()).to.equal(unlockTime);
    });

    it("Should set the right owner", async function () {
      const { lock, owner } = await loadFixture(deployOneYearLockFixture);

      expect(await lock.owner()).to.equal(owner.address);
    });

    it("Should receive and store the funds to lock", async function () {
      const { lock, lockedAmount } = await loadFixture(deployOneYearLockFixture);

      expect(await ethers.provider.getBalance(lock.address)).to.equal(lockedAmount);
    });

    it("Should fail if the unlockTime is not in the future", async function () {
      const latestTime = await ethers.provider.getBlock('latest').then(b => b.timestamp);
      const Lock = await ethers.getContractFactory("Lock");
      await expect(Lock.deploy(latestTime, { value: 1 })).to.be.revertedWith(
        "Unlock time should be in the future"
      );
    });
  });

  describe("Withdrawals", function () {
    describe("Validations", function () {
      it("Should revert with the right error if called too soon", async function () {
        const { lock } = await loadFixture(deployOneYearLockFixture);

        await expect(lock.withdraw()).to.be.revertedWith(
          "You can't withdraw yet"
        );
      });

      it("Should revert with the right error if called from another account", async function () {
        const { lock, unlockTime, otherAccount } = await loadFixture(
          deployOneYearLockFixture
        );

        await network.provider.send("evm_setNextBlockTimestamp", [unlockTime]);
        await network.provider.send("evm_mine");

        await expect(lock.connect(otherAccount).withdraw()).to.be.revertedWith(
          "You aren't the owner"
        );
      });

      it("Shouldn't fail if the unlockTime has arrived and the owner calls it", async function () {
        const { lock, unlockTime } = await loadFixture(
          deployOneYearLockFixture
        );

        await network.provider.send("evm_setNextBlockTimestamp", [unlockTime]);
        await network.provider.send("evm_mine");

        await expect(lock.withdraw()).not.to.be.reverted;
      });
    });

    describe("Events", function () {
      it("Should emit an event on withdrawals", async function () {
        const { lock, unlockTime, lockedAmount } = await loadFixture(
          deployOneYearLockFixture
        );

        await network.provider.send("evm_setNextBlockTimestamp", [unlockTime]);
        await network.provider.send("evm_mine");

        await expect(lock.withdraw())
          .to.emit(lock, "Withdrawal")
          .withArgs(lockedAmount, await ethers.provider.getBlock('latest').then(b => b.timestamp));
      });
    });

    describe("Transfers", function () {
      it("Should transfer the funds to the owner", async function () {
        const { lock, unlockTime, lockedAmount, owner } = await loadFixture(
          deployOneYearLockFixture
        );

        await network.provider.send("evm_setNextBlockTimestamp", [unlockTime]);
        await network.provider.send("evm_mine");

        const initialOwnerBalance = await ethers.provider.getBalance(owner.address);
        const initialLockBalance = await ethers.provider.getBalance(lock.address);

        const withdrawTx = await lock.withdraw();
        const receipt = await withdrawTx.wait();

        const gasUsed = receipt.gasUsed.mul(receipt.effectiveGasPrice);

        const finalOwnerBalance = await ethers.provider.getBalance(owner.address);
        const finalLockBalance = await ethers.provider.getBalance(lock.address);

        // Check that the owner's balance has not decreased
        expect(finalOwnerBalance).to.be.gte(initialOwnerBalance.sub(gasUsed));

        // Check that the lock's balance is now 0
        expect(finalLockBalance).to.equal(0);

        // Check that the owner's balance has increased by approximately the locked amount
        const balanceDifference = finalOwnerBalance.sub(initialOwnerBalance).add(gasUsed);
        expect(balanceDifference).to.be.closeTo(lockedAmount, ethers.utils.parseEther("0.01")); // Allow for small deviation
      });
    });
  });

  describe("Multiple operations", function () {
    it("Should allow multiple deposits", async function () {
      const { lock, owner } = await loadFixture(deployOneYearLockFixture);
      await lock.deposit({ value: ethers.utils.parseEther("1") });
      await lock.deposit({ value: ethers.utils.parseEther("2") });
      const balance = await ethers.provider.getBalance(lock.address);
      expect(balance).to.equal(ethers.utils.parseEther("4")); // 1 ETH from deployment + 3 ETH from deposits
    });

    it("Should not allow withdrawal before unlock time even after multiple deposits", async function () {
      const { lock, owner } = await loadFixture(deployOneYearLockFixture);
      await lock.deposit({ value: ethers.utils.parseEther("1") });
      await expect(lock.withdraw()).to.be.revertedWith("You can't withdraw yet");
    });

    it("Should emit Deposit event on deposit", async function () {
      const { lock, owner } = await loadFixture(deployOneYearLockFixture);
      await expect(lock.deposit({ value: ethers.utils.parseEther("1") }))
        .to.emit(lock, "Deposit")
        .withArgs(ethers.utils.parseEther("1"), await ethers.provider.getBlock('latest').then(b => b.timestamp));
    });
  });

  describe("Edge cases", function () {
    it("Should handle very far future unlock times", async function () {
      const Lock = await ethers.getContractFactory("Lock");
      const farFuture = Math.floor(Date.now() / 1000) + 100 * 365 * 24 * 60 * 60; // 100 years from now
      const lock = await Lock.deploy(farFuture, { value: ethers.utils.parseEther("1") });
      expect(await lock.unlockTime()).to.equal(farFuture);
    });

    it("Should fail to deploy with past unlock time", async function () {
      const Lock = await ethers.getContractFactory("Lock");
      const pastTime = Math.floor(Date.now() / 1000) - 1; // 1 second ago
      await expect(Lock.deploy(pastTime, { value: ethers.utils.parseEther("1") }))
        .to.be.revertedWith("Unlock time should be in the future");
    });
  });

  describe("Gas usage", function () {
    it("Should deploy with reasonable gas", async function () {
      const Lock = await ethers.getContractFactory("Lock");
      const unlockTime = (await ethers.provider.getBlock('latest')).timestamp + 60; // 1 minute from now
      const deploymentGas = await Lock.signer.estimateGas(
        Lock.getDeployTransaction(unlockTime, { value: ethers.utils.parseEther("1") })
      );
      expect(deploymentGas).to.be.lt(1500000); // Adjust this value based on your requirements
    });

    it("Should withdraw with reasonable gas", async function () {
      const { lock, unlockTime, owner } = await loadFixture(deployOneYearLockFixture);
      await network.provider.send("evm_setNextBlockTimestamp", [unlockTime]);
      await network.provider.send("evm_mine");
      const withdrawGas = await lock.connect(owner).estimateGas.withdraw();
      expect(withdrawGas).to.be.lt(100000); // Adjust this value based on your requirements
    });
  });
});