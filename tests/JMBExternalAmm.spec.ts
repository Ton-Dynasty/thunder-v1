import { Blockchain, SandboxContract, TreasuryContract, printTransactionFees } from '@ton/sandbox';
import { Address, Cell, SenderArguments, Transaction, beginCell, storeStateInit, toNano } from '@ton/core';
import { JettonMasterBondV1, MasterOpocde, ToTheMoon } from '../wrappers/JettonMasterBondV1';
import '@ton/test-utils';
import { compile } from '@ton/blueprint';
import { JettonWallet } from '../wrappers/JettonWallet';
import { loadJMBondFixture, buyToken } from './helper';
import { collectCellStats, computedGeneric } from '../gasUtils';
import { findTransactionRequired } from '@ton/test-utils';
import { MockContract } from '../wrappers/MockContract';
import JettonMaster from './simulate';
import exp from 'constants';

describe('JettonMasterBondV1 general testcases', () => {
    let blockchain: Blockchain;
    let deployer: SandboxContract<TreasuryContract>;
    let jettonMasterBondV1: SandboxContract<JettonMasterBondV1>;
    let printTxGasStats: (name: string, trans: Transaction) => bigint;
    let master: JettonMaster;
    const precision = 1000n;
    const fee_rate = 10n;
    const gas_cost = toNano('1');
    const TON = toNano('1');
    const commission = 100n;
    const airdropRate = 10n;
    const farmRate = 10n;

    beforeEach(async () => {
        printTxGasStats = (name, transaction) => {
            const txComputed = computedGeneric(transaction);
            console.log(`${name} used ${txComputed.gasUsed} gas`);
            console.log(`${name} gas cost: ${txComputed.gasFees}`);
            return txComputed.gasFees;
        };
        const totalSupply = 100000000n * TON;
        const precision = 1000n;
        const feeRate = 10n;
        const vTon = 1000n * TON;
        const tonTheMoon = 1500n * TON;
        master = new JettonMaster(tonTheMoon, vTon, totalSupply, precision, feeRate, commission, airdropRate, farmRate);

        ({ blockchain, deployer, jettonMasterBondV1 } = await loadJMBondFixture(vTon, tonTheMoon, fee_rate));
    });

    const userWallet = async (address: Address, jettonMaster: SandboxContract<JettonMasterBondV1>) =>
        blockchain.openContract(JettonWallet.createFromAddress(await jettonMaster.getWalletAddress(address)));

    it('should deploy', async () => {
        const jettonMasterBondV1Code = await compile(JettonMasterBondV1.name);
        const jettonWalletCode = await compile(JettonWallet.name);

        const blockchain = await Blockchain.create();
        const deployer = await blockchain.treasury('deployer', { workchain: 0, balance: toNano('100000000') });

        const jettonMasterBondV1 = blockchain.openContract(
            JettonMasterBondV1.createFromConfig(
                {
                    totalSupply: toNano('100000000'),
                    adminAddress: deployer.address,
                    tonReserves: 0n,
                    jettonReserves: toNano('100000000'),
                    fee: 0n,
                    onMoon: false,
                    jettonWalletCode: jettonWalletCode,
                    jettonContent: beginCell().endCell(),
                    vTon: 1000n * TON,
                    tonTheMoon: 1500n * TON,
                    feeRate: 10n,
                },
                jettonMasterBondV1Code,
            ),
        );
        const deployJettonMasterResult = await buyToken(
            jettonMasterBondV1,
            deployer,
            0n,
            0n,
            deployer.address, // destination who will receive the premint meme token
        );

        expect(deployJettonMasterResult.transactions).toHaveTransaction({
            from: deployer.address,
            to: jettonMasterBondV1.address,
            deploy: true,
            success: true,
        });

        // Jetton master send jetton internal transfer to deployer jetton wallet
        const deployerJettonWalletAddress = await jettonMasterBondV1.getWalletAddress(deployer.address);
        expect(deployJettonMasterResult.transactions).toHaveTransaction({
            op: MasterOpocde.InternalTransfer,
            from: jettonMasterBondV1.address,
            to: deployerJettonWalletAddress,
            success: true,
        });

        // Expect that depolyer jetton wallet send excess to deployer
        expect(deployJettonMasterResult.transactions).toHaveTransaction({
            op: MasterOpocde.Excess,
            from: deployerJettonWalletAddress,
            to: deployer.address,
            success: true,
        });

        // Calculate Jetton Master Bond contract gas fee
        const smc = await blockchain.getContract(jettonMasterBondV1.address);
        if (smc.accountState === undefined) throw new Error("Can't access wallet account state");
        if (smc.accountState.type !== 'active') throw new Error('Wallet account is not active');
        if (smc.account.account === undefined || smc.account.account === null)
            throw new Error("Can't access wallet account!");
        console.log('Jetton Master Bond max storage stats:', smc.account.account.storageStats.used);
        const state = smc.accountState.state;
        const stateCell = beginCell().store(storeStateInit(state)).endCell();
        console.log('State init stats:', collectCellStats(stateCell, []));

        // Calculate gas fee for buy token transaction
        const deployMasterTx = findTransactionRequired(deployJettonMasterResult.transactions, {
            from: deployer.address,
            to: jettonMasterBondV1.address,
            deploy: true,
            success: true,
        });
        printTxGasStats('deployMasterTx', deployMasterTx);
    });

    it('should buy token with 10 tons', async () => {
        // Get the ton reserves and jetton reserves before buying token
        let tonReservesBefore = (await jettonMasterBondV1.getMasterData()).tonReserves;
        let jettonReservesBefore = (await jettonMasterBondV1.getMasterData()).jettonReserves;

        const buyer = await blockchain.treasury('buyer', { workchain: 0, balance: toNano('1000000') });
        let buyerTonBalanceBefore = await buyer.getBalance();
        let tonAmount = toNano('10'); // Buyer buys meme token with 10 tons
        let sendAllTon = tonAmount + gas_cost;
        const buyTokenResult = await jettonMasterBondV1.sendMint(
            buyer.getSender(),
            { value: sendAllTon },
            {
                $$type: 'BuyToken',
                queryId: 0n,
                tonAmount: tonAmount,
                minTokenOut: 0n,
                destination: buyer.address,
                responseAddress: buyer.address,
                custom_payload: null,
                forwardTonAmount: 0n,
                forwardPayload: beginCell().storeUint(0n, 1).endCell(),
            },
        );
        let buyerTonBalanceAfter = await buyer.getBalance();

        // Calculate gas fee for buy token transaction
        const buyMeMeTx = findTransactionRequired(buyTokenResult.transactions, {
            op: MasterOpocde.ThunderMint,
            from: buyer.address,
            to: jettonMasterBondV1.address,
            success: true,
        });
        printTxGasStats('Buy Meme Jetton With TON', buyMeMeTx);

        // Expect that buyer send op::mint to jettonMasterBondV1
        expect(buyTokenResult.transactions).toHaveTransaction({
            op: MasterOpocde.ThunderMint,
            from: buyer.address,
            to: jettonMasterBondV1.address,
            success: true,
        });

        // Expect jettonMasterBondV1 send internal transfer to buyer memejetonWallet
        let buyerMemejetonWalletAddress = await jettonMasterBondV1.getWalletAddress(buyer.address);
        expect(buyTokenResult.transactions).toHaveTransaction({
            op: MasterOpocde.InternalTransfer,
            from: jettonMasterBondV1.address,
            to: buyerMemejetonWalletAddress,
            success: true,
        });

        // Expect that buyers ton balance decreased at least tonAmount (ton amount + gas fee)
        expect(buyerTonBalanceBefore - buyerTonBalanceAfter).toBeGreaterThanOrEqual(tonAmount);

        // Get the ton reserves and jetton reserves after buying token
        let tonReservesAfter = (await jettonMasterBondV1.getMasterData()).tonReserves;
        let jettonReservesAfter = (await jettonMasterBondV1.getMasterData()).jettonReserves;

        // const simulateMintResult = simulateMint(toNano('10'));
        master.mint(tonAmount);
        const simulateMintResult = master.stats();

        // Expect that ton reserves is equal to 9900000000n
        expect(tonReservesAfter).toEqual(simulateMintResult.ton_reserve);

        // Expect that jetton reserve is equal to 99019704921279334n
        expect(jettonReservesAfter).toEqual(simulateMintResult.jetton_reserve);

        // Expect that buyer received meme token
        let buyerWallet = await userWallet(buyer.address, jettonMasterBondV1);
        let buyerMemeTokenBalance = await buyerWallet.getJettonBalance();
        expect(buyerMemeTokenBalance).toEqual(jettonReservesBefore - jettonReservesAfter);

        // Expect buyer meme token balance is equal to 980295078720666n
        expect(buyerMemeTokenBalance).toBe(simulateMintResult.total_supply - simulateMintResult.jetton_reserve);

        // Expect that ton reserves increased tonAmount * 90%
        expect(tonReservesAfter - tonReservesBefore).toEqual((tonAmount * (precision - fee_rate)) / precision);

        // Expect that fees increased tonAmount * 10%
        let feeAfter = (await jettonMasterBondV1.getMasterData()).fee;
        expect(feeAfter).toEqual(simulateMintResult.protocol_fee);
    });

    it('should burn half of buyer meme tokens', async () => {
        const buyer = await blockchain.treasury('buyer', { workchain: 0, balance: toNano('1000000') });
        const buyTon = toNano('10');
        await buyToken(jettonMasterBondV1, buyer, buyTon);
        // const simulateBeforeBurnResult = simulateMint(buyTon);
        master.mint(buyTon);
        const simulateBeforeBurnResult = master.stats();

        // get state before burning meme tokens
        let tonReserverBefore = (await jettonMasterBondV1.getMasterData()).tonReserves;
        let jettonReservesBefore = (await jettonMasterBondV1.getMasterData()).jettonReserves;
        let buyerWallet = await userWallet(buyer.address, jettonMasterBondV1);
        let buyerMemeTokenBalanceBefore = await buyerWallet.getJettonBalance();

        // Buyers burn half of meme tokens
        let buyerTonBalanceBefore = await buyer.getBalance();
        let burnAmount = buyerMemeTokenBalanceBefore / 2n;
        const burnResult = await buyerWallet.sendBurn(buyer.getSender(), gas_cost, burnAmount, null, null);

        const burnMeMeTx = findTransactionRequired(burnResult.transactions, {
            op: MasterOpocde.BurnNotification,
            from: buyerWallet.address,
            to: jettonMasterBondV1.address,
            success: true,
        });
        printTxGasStats('Burn Meme Jetton With TON', burnMeMeTx);

        let buyerMemeTokenBalanceAfter = await buyerWallet.getJettonBalance();
        let buyerTonBalanceAfter = await buyer.getBalance();

        // Expect that buyers meme token balance decreased burnAmount
        expect(buyerMemeTokenBalanceBefore - buyerMemeTokenBalanceAfter).toEqual(burnAmount);

        // Expect that buyer send op::burn to buyers memejetonWallet
        expect(burnResult.transactions).toHaveTransaction({
            op: MasterOpocde.Burn,
            from: buyer.address,
            to: buyerWallet.address,
            success: true,
        });

        // Expect that buyers meme token wallet send jetton notification to jettonMasterBondV1
        expect(burnResult.transactions).toHaveTransaction({
            op: MasterOpocde.BurnNotification,
            from: buyerWallet.address,
            to: jettonMasterBondV1.address,
            success: true,
        });

        let tonReservesAfter = (await jettonMasterBondV1.getMasterData()).tonReserves;
        let jettonReservesAfter = await (await jettonMasterBondV1.getMasterData()).jettonReserves;

        // ton reserve should decrease
        expect(tonReserverBefore).toBeGreaterThan(tonReservesAfter);

        // jetton reseve should increase
        expect(jettonReservesAfter - jettonReservesBefore).toEqual(burnAmount);
        master.burn(burnAmount);
        const simulateBurnResult = master.stats();

        // Expect ton reserves = 4925618189n
        expect(tonReservesAfter).toEqual(simulateBurnResult.ton_reserve);

        // Expect jetton reserves = 99509852460639667n
        expect(jettonReservesAfter).toEqual(simulateBurnResult.jetton_reserve);

        // Expect that buyers ton balance increased at least 4924637993n
        let gas_fee = toNano('0.05');
        let amountOut =
            simulateBeforeBurnResult.ton_reserve -
            simulateBurnResult.ton_reserve -
            (simulateBurnResult.protocol_fee - simulateBeforeBurnResult.protocol_fee);

        expect(buyerTonBalanceAfter - buyerTonBalanceBefore + gas_fee).toBeGreaterThanOrEqual(amountOut);
    });

    it('should burn buyer meme tokens and send to the assigned recipient', async () => {
        const buyer = await blockchain.treasury('buyer', { workchain: 0, balance: toNano('1000000') });
        let buyAmount = toNano('10');
        await buyToken(jettonMasterBondV1, buyer, buyAmount);
        master.mint(buyAmount);

        let buyerWallet = await userWallet(buyer.address, jettonMasterBondV1);
        let buyerMemeTokenBalanceBefore = await buyerWallet.getJettonBalance();

        // Buyers burn half of meme tokens
        let buyerTonBalanceBefore = await buyer.getBalance();
        let burnAmount = buyerMemeTokenBalanceBefore / 2n;
        let deployerTonBalanceBefore = await deployer.getBalance();
        const burnResult = await buyerWallet.sendBurn(buyer.getSender(), gas_cost, burnAmount, deployer.address, null);
        let deployerTonBalanceAfter = await deployer.getBalance();

        let buyerMemeTokenBalanceAfter = await buyerWallet.getJettonBalance();
        let buyerTonBalanceAfter = await buyer.getBalance();

        // Expect that buyers meme token balance decreased burnAmount
        expect(buyerMemeTokenBalanceBefore - buyerMemeTokenBalanceAfter).toEqual(burnAmount);

        // Expect that buyer send op::burn to buyers memejetonWallet
        expect(burnResult.transactions).toHaveTransaction({
            op: MasterOpocde.Burn,
            from: buyer.address,
            to: buyerWallet.address,
            success: true,
        });

        // Expect that buyers meme token wallet send jetton notification to jettonMasterBondV1
        expect(burnResult.transactions).toHaveTransaction({
            op: MasterOpocde.BurnNotification,
            from: buyerWallet.address,
            to: jettonMasterBondV1.address,
            success: true,
        });

        let tonReservesAfter = (await jettonMasterBondV1.getMasterData()).tonReserves;
        let jettonReservesAfter = await (await jettonMasterBondV1.getMasterData()).jettonReserves;
        master.burn(burnAmount);
        const simulateBurnResult = master.stats();

        // Expect ton reserves = 4925618189n
        expect(tonReservesAfter).toEqual(simulateBurnResult.ton_reserve);

        // Expect jetton reserves = 99509852460639667n
        expect(jettonReservesAfter).toEqual(simulateBurnResult.jetton_reserve);

        // Buyers ton balance should decrease at least gas fee
        let gas_fee = toNano('0.05');
        expect(buyerTonBalanceBefore - buyerTonBalanceAfter).toBeGreaterThan(gas_fee);
    });

    it('should ton the moon after ton reserves reach 10000 ton', async () => {
        const buyer = await blockchain.treasury('buyer', { workchain: 0, balance: toNano('10000000') });
        let buyerTonBalanceBefore = await buyer.getBalance();
        const buyTon = toNano('1000000');
        const toTheMoonResult = await buyToken(jettonMasterBondV1, buyer, buyTon);
        let buyerTonBalanceAfter = await buyer.getBalance();

        // Expect that jettonMasterBondV1 send jetton internal transfer to buyer meme token wallet
        let buyerWallet = await userWallet(buyer.address, jettonMasterBondV1);
        expect(toTheMoonResult.transactions).toHaveTransaction({
            op: MasterOpocde.InternalTransfer,
            from: jettonMasterBondV1.address,
            to: buyerWallet.address,
            success: true,
        });

        // Expect that buyers meme token wallet send excess to buyer
        expect(toTheMoonResult.transactions).toHaveTransaction({
            op: MasterOpocde.Excess,
            from: buyerWallet.address,
            to: buyer.address,
            success: true,
        });

        let jettonReservesAfter = await (await jettonMasterBondV1.getMasterData()).jettonReserves;
        let tonReservesAfter = (await jettonMasterBondV1.getMasterData()).tonReserves;

        // Expect that jetton reserves equal to k/x, where k = 10^11, x = 10^4 + 1000 (virtual ton), 10^9 is decimal
        master.mint(buyTon);
        const simulateMintResult = master.stats();
        expect(jettonReservesAfter).toEqual(simulateMintResult.jetton_reserve);

        // Expect that ton reserves = 10000000000000n
        expect(tonReservesAfter).toEqual(simulateMintResult.ton_reserve);

        // buyers meme token balance should be 90909090909090910n
        let buyerMemeTokenBalance = await buyerWallet.getJettonBalance();
        expect(buyerMemeTokenBalance).toEqual(simulateMintResult.total_supply - simulateMintResult.jetton_reserve);

        // buyer's ton balance should decrease at least 10000 ton
        expect(buyerTonBalanceBefore - buyerTonBalanceAfter).toBeGreaterThan(simulateMintResult.ton_reserve);

        // Expect that protocol fee match
        let feeAfter = (await jettonMasterBondV1.getMasterData()).fee;
        expect(feeAfter).toEqual(simulateMintResult.protocol_fee);

        // Epext that onMoon = true
        let onMoon = (await jettonMasterBondV1.getMasterData()).onMoon;
        expect(onMoon).toEqual(true);
    });

    it('should buy meme tokens and sell meme tokens 100 times and ton the moon', async () => {
        let buyer = await blockchain.treasury('buyer', { workchain: 0, balance: toNano('100000000') });
        let buyerTonBalanceBefore = await buyer.getBalance();
        const buyTon = toNano('10');
        let buyerWallet = await userWallet(buyer.address, jettonMasterBondV1);

        // use for loop to buy and sell meme tokens 100 times
        for (let i = 0; i < 10; i++) {
            await buyToken(jettonMasterBondV1, buyer, buyTon);
            master.mint(buyTon);
            let burnAmount = await buyerWallet.getJettonBalance();
            await buyerWallet.sendBurn(buyer.getSender(), gas_cost, burnAmount, null, null);
            master.burn(burnAmount);
        }

        const simulateResult = master.stats();

        // Expect that ton reserves = 0
        let tonReservesAfter = (await jettonMasterBondV1.getMasterData()).tonReserves;
        expect(tonReservesAfter).toEqual(simulateResult.ton_reserve);

        // Expect that jetton reserves = 100000000000000000n
        let jettonReservesAfter = await (await jettonMasterBondV1.getMasterData()).jettonReserves;
        expect(jettonReservesAfter).toEqual(simulateResult.jetton_reserve);

        // Expect that fee = 19900000000n
        let feeAfter100 = await (await jettonMasterBondV1.getMasterData()).fee;
        expect(feeAfter100).toEqual(simulateResult.protocol_fee);

        // Ton the moon
        const buyTontoMoon = toNano('1000000');
        const toTheMoonResult = await buyToken(jettonMasterBondV1, buyer, buyTontoMoon);
        master.mint(buyTontoMoon);
        const simulateToTheMoonResult = master.stats();

        // fee After should match the simulate result
        let feeAfter = (await jettonMasterBondV1.getMasterData()).fee;
        expect(feeAfter).toEqual(simulateToTheMoonResult.protocol_fee);

        // Epext that onMoon = true
        let onMoon = (await jettonMasterBondV1.getMasterData()).onMoon;
        expect(onMoon).toEqual(true);
    });

    it('should not buy meme tokens after token on the list', async () => {
        const buyer = await blockchain.treasury('buyer', { workchain: 0, balance: toNano('10000000') });
        const buyTon = toNano('1000000');
        await buyToken(jettonMasterBondV1, buyer, buyTon);

        // buyer try to buy meme token after token on the list
        let buyerBeforeBalance = await buyer.getBalance();
        const buyAgainResult = await buyToken(jettonMasterBondV1, buyer, buyTon);
        let buyerAfterBalance = await buyer.getBalance();

        // Expect buyer ton balance decreased only the gas fee
        let gas_fee = toNano('0.055');
        expect(buyerAfterBalance + gas_fee).toBeGreaterThan(buyerBeforeBalance);

        // Expect that jettonMasterBondV1 send ton back
        expect(buyAgainResult.transactions).toHaveTransaction({
            from: buyer.address,
            to: jettonMasterBondV1.address,
            success: false,
            exitCode: 2002,
        });
    });

    it('should admin send op::to_the_moon', async () => {
        const buyer = await blockchain.treasury('buyer', { workchain: 0, balance: toNano('10000000') });
        const buyTon = toNano('1000000');
        await buyToken(jettonMasterBondV1, buyer, buyTon);
        master.mint(buyTon);

        let adminTonBalanceBefore = await deployer.getBalance();
        let adminMemeWallet = await userWallet(deployer.address, jettonMasterBondV1);
        let adminMemeTokenBalanceBefore = await adminMemeWallet.getJettonBalance();
        let jettonReserves = await (await jettonMasterBondV1.getMasterData()).jettonReserves;
        const totalSupplyBefore = (await jettonMasterBondV1.getMasterData()).totalSupply;
        let toTheMoonResult = await jettonMasterBondV1.sendToTheMoon(deployer.getSender(), toNano('1.2'), {
            $$type: 'ToTheMoon',
            queryId: 0n,
            tonBody: beginCell().storeAddress(buyer.address).endCell(),
            jettonBody: beginCell().storeAddress(buyer.address).endCell(),
            vault1: buyer.address,
        });

        let adminTonBalanceAfter = await deployer.getBalance();
        let adminMemeTokenBalanceAfter = await adminMemeWallet.getJettonBalance();

        // Expect that admin send op::to_the_moon to jettonMasterBondV1
        expect(toTheMoonResult.transactions).toHaveTransaction({
            op: MasterOpocde.ToTheMoon,
            from: deployer.address,
            to: jettonMasterBondV1.address,
            success: true,
        });

        // Expecet that jettonMasterBondV1 send jetton internal transfer to admin meme token wallet
        expect(toTheMoonResult.transactions).toHaveTransaction({
            op: MasterOpocde.InternalTransfer,
            from: jettonMasterBondV1.address,
            to: adminMemeWallet.address,
            success: true,
        });

        // Expect that admin meme wallet send excess to admin
        expect(toTheMoonResult.transactions).toHaveTransaction({
            op: MasterOpocde.Excess,
            from: adminMemeWallet.address,
            to: deployer.address,
            success: true,
        });

        const simulateResult = master.calculateLiquidityAndFees();

        // Expect that admin balance increased at least ton_fee_for_admin - gas_fee
        let gas_fee = toNano('1');
        expect(adminTonBalanceAfter - adminTonBalanceBefore).toBeGreaterThan(
            simulateResult.ton_fee_for_admin - gas_fee,
        );

        // // Expect that admin jetton balance should be jetton_fee_for_admin
        expect(adminMemeTokenBalanceAfter).toEqual(simulateResult.jetton_fee_for_admin);
        expect(adminMemeTokenBalanceAfter).toEqual((totalSupplyBefore * (airdropRate + farmRate)) / precision);

        // Expect that total supply is decreased by (jetton_fee_for_admin + send_jetton_liquidity)
        let totalSupplyAfter = (await jettonMasterBondV1.getMasterData()).totalSupply;

        expect(totalSupplyAfter).toEqual(master.total_supply);

        // 2% of total supply
        expect(Number(adminMemeTokenBalanceAfter) / Number(totalSupplyBefore)).toBe(
            Number(airdropRate + farmRate) / Number(precision),
        );

        const trueAdminJettonFeeRatio = Number(simulateResult.true_jetton_fee_for_admin) / Number(totalSupplyBefore);

        const adminJettonFeeRatio = Number(adminMemeTokenBalanceAfter) / Number(totalSupplyBefore);

        expect((1 - Number(totalSupplyAfter) / Number(totalSupplyBefore)).toFixed(3)).toBe(
            (trueAdminJettonFeeRatio - adminJettonFeeRatio).toFixed(3),
        );

        // Expect that ton reserves = 0
        let tonReservesAfter = (await jettonMasterBondV1.getMasterData()).tonReserves;
        expect(tonReservesAfter).toEqual(0n);

        // Expect that jetton reserves = 0n
        let jettonReservesAfter = await (await jettonMasterBondV1.getMasterData()).jettonReserves;
        expect(jettonReservesAfter).toEqual(0n);

        // Expect that fee = 0n
        let feeAfter = await (await jettonMasterBondV1.getMasterData()).fee;
        expect(feeAfter).toEqual(0n);

        // admin address should be null
        let adminAddress = (await jettonMasterBondV1.getMasterData()).adminAddress;
        expect(adminAddress).toEqual(null);
    });

    it('should not send to the moon if jetotn master bond is not on moon', async () => {
        const buyer = await blockchain.treasury('buyer', { workchain: 0, balance: toNano('10000000') });
        const buyTon = toNano('100');
        await buyToken(jettonMasterBondV1, buyer, buyTon);
        let toTheMoonResult = await jettonMasterBondV1.sendToTheMoon(deployer.getSender(), toNano('0.05'), {
            $$type: 'ToTheMoon',
            queryId: 0n,
            tonBody: beginCell().storeAddress(buyer.address).endCell(),
            jettonBody: beginCell().storeAddress(buyer.address).endCell(),
            vault1: buyer.address,
        });
        // Expect to throw not on moon error 2005
        expect(toTheMoonResult.transactions).toHaveTransaction({
            from: deployer.address,
            to: jettonMasterBondV1.address,
            success: false,
            exitCode: 2005,
        });
    });

    it('should only admin can send op::to_the_moon', async () => {
        const buyer = await blockchain.treasury('buyer', { workchain: 0, balance: toNano('10000000') });
        const buyTon = toNano('100000');
        await buyToken(jettonMasterBondV1, buyer, buyTon);

        let toTheMoonResult = await jettonMasterBondV1.sendToTheMoon(buyer.getSender(), toNano('0.05'), {
            $$type: 'ToTheMoon',
            queryId: 0n,
            tonBody: beginCell().storeAddress(buyer.address).endCell(),
            jettonBody: beginCell().storeAddress(buyer.address).endCell(),
            vault1: buyer.address,
        });

        // Expect to not admin error 70
        expect(toTheMoonResult.transactions).toHaveTransaction({
            from: buyer.address,
            to: jettonMasterBondV1.address,
            success: false,
            exitCode: 70,
        });
    });

    it('should not sell meme tokens after token on the list', async () => {
        const buyer = await blockchain.treasury('buyer', { workchain: 0, balance: toNano('10000000') });
        const buyTon = toNano('1000000');
        await buyToken(jettonMasterBondV1, buyer, buyTon);

        // buyer try to sell meme token after token on the list
        let buyerWallet = await userWallet(buyer.address, jettonMasterBondV1);
        let buyerMemeTokenBalanceBefore = await buyerWallet.getJettonBalance();
        let totalSupplyBefore = (await jettonMasterBondV1.getMasterData()).totalSupply;

        // Buyers burn half of meme tokens
        let burnAmount = buyerMemeTokenBalanceBefore / 2n;
        const burnResult = await buyerWallet.sendBurn(buyer.getSender(), gas_cost, burnAmount, buyer.address, null);
        let buyerMemeTokenBalanceAfter = await buyerWallet.getJettonBalance();
        let totalSupplyAfter = (await jettonMasterBondV1.getMasterData()).totalSupply;

        // Expect that buyer send burn to his wallet
        expect(burnResult.transactions).toHaveTransaction({
            op: MasterOpocde.Burn,
            from: buyer.address,
            to: buyerWallet.address,
            success: true,
        });

        // Expect that buyer jetton wallet send burn notification to jettonMasterBondV1
        expect(burnResult.transactions).toHaveTransaction({
            op: MasterOpocde.BurnNotification,
            from: buyerWallet.address,
            to: jettonMasterBondV1.address,
            success: true,
        });

        // Expect that jettonMasterBondV1 send ton back
        expect(burnResult.transactions).toHaveTransaction({
            from: jettonMasterBondV1.address,
            to: buyer.address,
            success: true,
        });

        // Epect that buyer meme token balance is decreased burnAmount
        expect(buyerMemeTokenBalanceBefore - buyerMemeTokenBalanceAfter).toEqual(burnAmount);

        // Epect that total supply is decreased burnAmount
        expect(totalSupplyBefore - totalSupplyAfter).toEqual(burnAmount);
    });

    it('should not sell meme tokens if sending ton is not enough', async () => {
        const buyer = await blockchain.treasury('buyer', { workchain: 0, balance: toNano('1000000') });
        await buyToken(jettonMasterBondV1, buyer);

        // buyer try to sell meme token after token on the list

        let buyerWallet = await userWallet(buyer.address, jettonMasterBondV1);
        let buyerMemeTokenBalanceBefore = await buyerWallet.getJettonBalance();

        // Buyers burn half of meme tokens
        let burnAmount = buyerMemeTokenBalanceBefore / 2n;
        const burnResult = await buyerWallet.sendBurn(buyer.getSender(), toNano('0.006'), burnAmount, null, null);
        let buyerMemeTokenBalanceAfter = await buyerWallet.getJettonBalance();

        // Expect to throw token already listed error
        expect(burnResult.transactions).toHaveTransaction({
            from: buyerWallet.address,
            to: jettonMasterBondV1.address,
            success: false,
            exitCode: 2000,
        });

        // Epect that buyer meme token balance is still same
        expect(buyerMemeTokenBalanceAfter).toEqual(buyerMemeTokenBalanceBefore);
    });

    it('should throw not enough ton error when buy meme token but sending ton is not enough', async () => {
        const buyer = await blockchain.treasury('buyer', { workchain: 0, balance: toNano('1000000') });
        let tonAmount = toNano('10');
        let sendAllTon = gas_cost;
        let buyerBeforeBalance = await buyer.getBalance();
        const notEnoughTonResult = await jettonMasterBondV1.sendMint(
            buyer.getSender(),
            { value: sendAllTon },
            {
                $$type: 'BuyToken',
                queryId: 0n,
                tonAmount: tonAmount,
                minTokenOut: 0n,
                destination: buyer.address,
                responseAddress: buyer.address,
                custom_payload: null,
                forwardTonAmount: 0n,
                forwardPayload: beginCell().storeUint(0n, 1).endCell(),
            },
        );
        let buyerAfterBalance = await buyer.getBalance();

        // Epect to throw not enough ton error
        expect(notEnoughTonResult.transactions).toHaveTransaction({
            op: MasterOpocde.ThunderMint,
            from: buyer.address,
            to: jettonMasterBondV1.address,
            success: false,
            exitCode: 2000,
        });

        // Expect buyer ton balance decreased only the gas fee
        let gas_fee = toNano('0.055');
        expect(buyerAfterBalance + gas_fee).toBeGreaterThan(buyerBeforeBalance);
    });

    it('should throw not meet minAmount error when min amount is less that buyer expected', async () => {
        const buyer = await blockchain.treasury('buyer', { workchain: 0, balance: toNano('1000000') });
        let tonAmount = toNano('10');
        let sendAllTon = tonAmount + gas_cost;
        let buyerBeforeBalance = await buyer.getBalance();
        const notEnoughTonResult = await jettonMasterBondV1.sendMint(
            buyer.getSender(),
            { value: sendAllTon },
            {
                $$type: 'BuyToken',
                queryId: 0n,
                tonAmount: tonAmount,
                minTokenOut: toNano('1000000000000000000000'),
                destination: buyer.address,
                responseAddress: buyer.address,
                custom_payload: null,
                forwardTonAmount: 0n,
                forwardPayload: beginCell().storeUint(0n, 1).endCell(),
            },
        );
        let buyerAfterBalance = await buyer.getBalance();

        // Epect to throw not enough ton error
        expect(notEnoughTonResult.transactions).toHaveTransaction({
            op: MasterOpocde.ThunderMint,
            from: buyer.address,
            to: jettonMasterBondV1.address,
            success: false,
            exitCode: 2001,
        });

        // Expect buyer ton balance decreased only the gas fee
        let gas_fee = toNano('0.055');
        expect(buyerAfterBalance + gas_fee).toBeGreaterThan(buyerBeforeBalance);
    });

    it('should throw wrong wallet error when send burn notification with wrong wallet', async () => {
        const buyer = await blockchain.treasury('buyer', { workchain: 0, balance: toNano('1000000') });
        await buyToken(jettonMasterBondV1, buyer);

        let buyerWallet = await userWallet(buyer.address, jettonMasterBondV1);
        let buyerMemeTokenBalanceBefore = await buyerWallet.getJettonBalance();

        // Buyers burn half of meme tokens
        let burnAmount = buyerMemeTokenBalanceBefore / 2n;
        let burnNotifyPayload = beginCell()
            .storeUint(0x7bdd97de, 32)
            .storeUint(0, 64) // op, queryId
            .storeCoins(burnAmount)
            .storeAddress(buyer.address)
            .storeAddress(null)
            .endCell();
        // const wrongWalletBurnResult = await
        let burnArg: SenderArguments = {
            value: gas_cost,
            to: jettonMasterBondV1.address,
            body: burnNotifyPayload,
        };
        const wrongBurnResult = await buyer.send(burnArg);

        // Expect to throw wrong wallet error
        expect(wrongBurnResult.transactions).toHaveTransaction({
            from: buyer.address,
            to: jettonMasterBondV1.address,
            success: false,
            exitCode: 74,
        });
    });

    it('should let mock contract to send provide wallet address and receive take wallet msg', async () => {
        let mockContract = blockchain.openContract(
            MockContract.createFromConfig(
                { jettonMasterAddress: jettonMasterBondV1.address, jettonWalletAddress: deployer.address },
                await compile(MockContract.name),
            ),
        );
        const deployResult = await mockContract.sendDeploy(deployer.getSender(), gas_cost);
        let mockWalletAddressFromContract = await mockContract.getWalletAddress();

        let mockWalletAddressFromGetMethod = await jettonMasterBondV1.getWalletAddress(mockContract.address);
        // Expect that mockWalletAddress from jettonMasterBond is equal to the address from get method
        expect(mockWalletAddressFromContract.toString()).toEqual(mockWalletAddressFromGetMethod.toString());

        // Expect that mockContract send take wallet message to jettonMasterBond
        expect(deployResult.transactions).toHaveTransaction({
            op: 0x2c76b973,
            from: mockContract.address,
            to: jettonMasterBondV1.address,
            success: true,
        });

        // Expect that jettonMasterBond send take wallet message to mockContract
        expect(deployResult.transactions).toHaveTransaction({
            op: 0xd1735400,
            from: jettonMasterBondV1.address,
            to: mockContract.address,
            success: true,
        });
    });

    it('should throw error when burn amount is equal to 0', async () => {
        const buyer = await blockchain.treasury('buyer', { workchain: 0, balance: toNano('1000000') });
        await buyToken(jettonMasterBondV1, buyer);

        // get state before burning meme tokens
        let tonReserverBefore = (await jettonMasterBondV1.getMasterData()).tonReserves;
        let jettonReservesBefore = (await jettonMasterBondV1.getMasterData()).jettonReserves;
        let buyerWallet = await userWallet(buyer.address, jettonMasterBondV1);
        let buyerMemeTokenBalanceBefore = await buyerWallet.getJettonBalance();

        // Buyers burn half of meme tokens
        let buyerTonBalanceBefore = await buyer.getBalance();
        let burnAmount = 0n;
        const burnResult = await buyerWallet.sendBurn(buyer.getSender(), gas_cost, burnAmount, null, null);

        let buyerMemeTokenBalanceAfter = await buyerWallet.getJettonBalance();
        let buyerTonBalanceAfter = await buyer.getBalance();

        let buyerMemeWallet = await userWallet(buyer.address, jettonMasterBondV1);
        expect(burnResult.transactions).toHaveTransaction({
            from: buyerMemeWallet.address,
            to: jettonMasterBondV1.address,
            success: false,
            exitCode: 2004,
        });

        // Expect that buyers meme token balance is still same
        expect(buyerMemeTokenBalanceAfter).toEqual(buyerMemeTokenBalanceBefore);

        // Expect that buyer's ton is slightly decreased
        expect(buyerTonBalanceBefore - buyerTonBalanceAfter).toBeGreaterThan(gas_cost);
    });

    it('should admin can claim admin fee', async () => {
        const buyer = await blockchain.treasury('buyer', { workchain: 0, balance: toNano('10000000') });
        const buyTon = toNano('5000');
        await buyToken(jettonMasterBondV1, buyer, buyTon);

        const fee = (await jettonMasterBondV1.getMasterData()).fee;

        // Admin claim admin fee
        let deployerTonBalanceBefore = await deployer.getBalance();
        const claimResult = await jettonMasterBondV1.sendClaimFee(deployer.getSender(), {
            $$type: 'Claim',
            queryId: 0n,
        });
        let deployerTonBalanceAfter = await deployer.getBalance();

        // Expect that depoyer send claim fee to jettonMasterBondV1
        expect(claimResult.transactions).toHaveTransaction({
            op: MasterOpocde.ClaimAdminFee,
            from: deployer.address,
            to: jettonMasterBondV1.address,
            success: true,
        });

        const claimAdminFee = findTransactionRequired(claimResult.transactions, {
            op: MasterOpocde.ClaimAdminFee,
            from: deployer.address,
            to: jettonMasterBondV1.address,
            success: true,
        });
        printTxGasStats('Claim Admin Fee:', claimAdminFee);

        // Expect that jettonMasterBondV1 send fees to deployer
        expect(claimResult.transactions).toHaveTransaction({
            from: jettonMasterBondV1.address,
            to: deployer.address,
            success: true,
        });

        // Expect that deployer ton balance increased at least fee
        let gas_fee_and_build_pool_fee = toNano('0.5');
        expect(deployerTonBalanceAfter - deployerTonBalanceBefore).toBeGreaterThanOrEqual(
            fee - gas_fee_and_build_pool_fee,
        );
    });

    it('should only admin can claim admin fee', async () => {
        const buyer = await blockchain.treasury('buyer', { workchain: 0, balance: toNano('10000000') });
        const buyTon = toNano('5000');
        await buyToken(jettonMasterBondV1, buyer, buyTon);

        // Admin claim admin fee
        const claimResult = await jettonMasterBondV1.sendClaimFee(buyer.getSender(), {
            $$type: 'Claim',
            queryId: 0n,
        });
        expect(claimResult.transactions).toHaveTransaction({
            from: buyer.address,
            to: jettonMasterBondV1.address,
            success: false,
            exitCode: 70,
        });
    });
});

describe('JettonMasterBondV1 premint when deploying contract', () => {
    let blockchain: Blockchain;
    let deployer: SandboxContract<TreasuryContract>;
    let jettonMasterBondV1: SandboxContract<JettonMasterBondV1>;

    beforeEach(async () => {
        blockchain = await Blockchain.create();
        deployer = await blockchain.treasury('deployer', { workchain: 0, balance: toNano('100000000') });
    });

    const userWallet = async (address: Address, jettonMaster: SandboxContract<JettonMasterBondV1>) =>
        blockchain.openContract(JettonWallet.createFromAddress(await jettonMaster.getWalletAddress(address)));

    it('should deploy contract with premint', async () => {
        const jettonMasterBondV1Code = await compile(JettonMasterBondV1.name);
        const jettonWalletCode = await compile(JettonWallet.name);
        const TON = toNano('1');

        const jettonMasterBondV1 = blockchain.openContract(
            JettonMasterBondV1.createFromConfig(
                {
                    totalSupply: toNano('100000000'),
                    adminAddress: deployer.address,
                    tonReserves: 0n,
                    jettonReserves: toNano('100000000'),
                    fee: 0n,
                    onMoon: false,
                    jettonWalletCode: jettonWalletCode,
                    jettonContent: beginCell().endCell(),
                    vTon: 1000n * TON,
                    tonTheMoon: 1500n * TON,
                    feeRate: 10n,
                },
                jettonMasterBondV1Code,
            ),
        );

        const buyer = await blockchain.treasury('buyer', { workchain: 0, balance: toNano('1000000') });

        let premintAmount = toNano('10');
        let minAmount = 0n;
        const deployJettonMasterResult = await buyToken(
            jettonMasterBondV1,
            deployer,
            premintAmount,
            minAmount,
            buyer.address, // destination who will receive the premint meme token
        );

        let buyersMemeWallet = await userWallet(buyer.address, jettonMasterBondV1);
        let buyerMemeTokenBalance = await buyersMemeWallet.getJettonBalance();

        expect(deployJettonMasterResult.transactions).toHaveTransaction({
            from: deployer.address,
            to: jettonMasterBondV1.address,
            deploy: true,
            success: true,
        });

        // Expect buyer meme token balance is equal to 980295078720666n
        expect(buyerMemeTokenBalance).toBe(980295078720666n);
    });
});
