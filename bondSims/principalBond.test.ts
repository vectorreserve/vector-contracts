const { ethers } = require("hardhat");
const { expect } = require("chai");

describe("Test", () => {
    let WETHAddress,
        weth,
        VEC,
        vec,
        VETH,
        vETH,
        Treasury,
        treasury,
        SVEC,
        sVEC,
        Staking,
        staking,
        Distributor,
        distributor,
        Mock,
        mock,
        Bond,
        bond,
        deployer,
        owner;

    async function addTime(time) {
        await network.provider.send("evm_increaseTime", [time]);
        await network.provider.send("evm_mine");
    }

    beforeEach(async () => {
        [deployer, owner] = await ethers.getSigners();

        const EIGHT_HOURS = "28800";
        const ONE_DAY = "86400";

        WETHAddress = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2";
        weth = await ethers.getContractAt("contracts/interface/IWETH.sol:IWETH", WETHAddress);

        VEC = await ethers.getContractFactory("Vector");
        vec = await VEC.deploy();

        VETH = await ethers.getContractFactory("VectorETH");
        vETH = await VETH.deploy();

        Treasury = await ethers.getContractFactory("VectorTreasury");
        treasury = await Treasury.deploy(vec.getAddress(), vETH.getAddress());

        SVEC = await ethers.getContractFactory("sVEC");
        sVEC = await SVEC.deploy();

        Staking = await ethers.getContractFactory("VECStaking");
        staking = await Staking.deploy(vec.getAddress(), sVEC.getAddress(), EIGHT_HOURS, ONE_DAY);

        Distributor = await ethers.getContractFactory("Distributor");
        distributor = await Distributor.deploy(
            treasury.getAddress(),
            vec.getAddress(),
            vETH.getAddress(),
            staking.getAddress(),
            staking.getAddress()
        );

        await vec.initialize(treasury.getAddress(), distributor.getAddress(), vETH.getAddress());

        await treasury.addApprovedMinter(distributor.getAddress());

        await sVEC.setIndex("1000000000");
        await sVEC.initialize(staking.getAddress());

        await staking.setDistributor(distributor.getAddress());
        await distributor.setVECRate("5000");

        Bond = await ethers.getContractFactory("VectorBonding");
        bond = await Bond.deploy(treasury.getAddress(), vETH.getAddress(), WETHAddress, false);

        await bond.setFeeAndFeeTo(owner.getAddress(), "50000");

        await treasury.addApprovedMinter(bond.getAddress());

        await weth.approve(bond.getAddress(), "100000000000000000000000");
        await weth.approve(vETH.getAddress(), "100000000000000000000000");
        await weth.deposit({ value: ethers.parseEther("250.0") });
        await weth.connect(owner).deposit({ value: ethers.parseEther("250.0") });
        await weth.connect(owner).transfer(deployer.address, ethers.parseEther("250.0"));

        await vETH
            .connect(deployer)
            .addRestakedLST(weth.getAddress(), ethers.parseEther("0.9"));
        await vETH
            .connect(deployer)
            .deposit(weth.getAddress(), treasury.getAddress(), ethers.parseEther("100.0"));

        await bond.setBondTerms("0", "604800");

        await vETH.openDeposits();

        await bond.initializeBond(
            "100000",
            "604800",
            "0",
            "25",
            "250000000000",
            "120000000000",
            "0"
        );
    });

    describe("test", () => {
        it("allow bond", async () => {
            console.log(await bond.bondPrice());
            console.log(await treasury.valueOfToken(weth.getAddress(), "10000000000000000000"));
            console.log(await bond.payoutFor("10000000000000000000"));

            await bond.deposit("10000000000000000000", "20000000000000000");

            console.log(await bond.bondPrice());
        });

        it("SHOULD BOND", async () => {
            let totalTimePassed = 0;
            let bonds = 1;

            async function payout() {
                while (totalTimePassed < 2592000) {
                    console.log(
                        "Bond Price Before Bond (" +
                            +bonds +
                            "): " +
                            (await bond.bondPrice()).toString()
                    );

                    await bond.deposit("10000000000000000000", "20000000000000000");

                    console.log(
                        "Bond Price After Bond (" +
                            +bonds +
                            "): " +
                            (await bond.bondPrice()).toString()
                    );
                    console.log();

                    /// 12 HOURS ///
                    let timePassed = 43200;
                    await addTime(43200);

                    while ((await bond.bondPrice()) > "10500000000000000") {
                        await addTime(60);
                        timePassed = timePassed + 60;
                    }
                    totalTimePassed = totalTimePassed + timePassed;

                    console.log(
                        "Time Passed (Bonds purchased " + (+bonds + +1) + "): " + timePassed
                    );
                    console.log(
                        "Bond Payout (" +
                            (+bonds + +1) +
                            "): " +
                            (await bond.payoutFor("10000000000000000000")).toString()
                    );
                    console.log(totalTimePassed);
                    bonds++;
                }

                console.log("Total PRINCIPAL Collected " + (await bond.totalPrincipalBonded()));
                console.log("Total VEC PAYED " + (await bond.totalPayoutGiven()));
                console.log("Total PRINCIAPL FEES PAYED " + (await weth.balanceOf(owner.address)));
            }

            await payout();
        });
    });
});
