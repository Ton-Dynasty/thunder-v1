import { Blockchain, SandboxContract, TreasuryContract, printTransactionFees } from '@ton/sandbox';
import { Address, Cell, SenderArguments, Transaction, beginCell, storeStateInit, toNano } from '@ton/core';
import { JettonMasterBondV1, MasterOpocde } from '../wrappers/JettonMasterBondV1';
import { DexRouter } from '../wrappers/DexRouter';
import '@ton/test-utils';
import { compile } from '@ton/blueprint';
import { JettonWallet } from '../wrappers/JettonWallet';
import { loadJMBondFixture, buyToken } from './helper';
import { collectCellStats, computedGeneric } from '../gasUtils';
import { findTransactionRequired } from '@ton/test-utils';
import { MockContract } from '../wrappers/MockContract';
import { PoolV1 } from '../wrappers/PoolV1';

describe('JettonMasterBondV1 general testcases', () => {
    let blockchain: Blockchain;
    let deployer: SandboxContract<TreasuryContract>;
    let dexRouter: SandboxContract<DexRouter>;
    let jettonMasterBondV1: SandboxContract<JettonMasterBondV1>;
    let printTxGasStats: (name: string, trans: Transaction) => bigint;
    const precision = 1000n;
    const fee_rate = 10n;

    beforeEach(async () => {
        ({ blockchain, deployer, dexRouter, jettonMasterBondV1 } = await loadJMBondFixture());
        printTxGasStats = (name, transaction) => {
            const txComputed = computedGeneric(transaction);
            console.log(`${name} used ${txComputed.gasUsed} gas`);
            console.log(`${name} gas cost: ${txComputed.gasFees}`);
            return txComputed.gasFees;
        };
    });

    const userWallet = async (address: Address, jettonMaster: SandboxContract<JettonMasterBondV1>) =>
        blockchain.openContract(JettonWallet.createFromAddress(await jettonMaster.getWalletAddress(address)));

    it('should deploy', async () => {
        // Calculate Jetton Master Bond contract gas fee
        // const smc = await blockchain.getContract(jettonMasterBondV1.address);
        // if (smc.accountState === undefined) throw new Error("Can't access wallet account state");
        // if (smc.accountState.type !== 'active') throw new Error('Wallet account is not active');
        // if (smc.account.account === undefined || smc.account.account === null)
        //     throw new Error("Can't access wallet account!");
        // console.log('Jetton Master Bond max storage stats:', smc.account.account.storageStats.used);
        // const state = smc.accountState.state;
        // const stateCell = beginCell().store(storeStateInit(state)).endCell();
        // console.log('State init stats:', collectCellStats(stateCell, []));
        // Calculate Dex Router contract gas fee
        // const smc = await blockchain.getContract(dexRouter.address);
        // if (smc.accountState === undefined) throw new Error("Can't access wallet account state");
        // if (smc.accountState.type !== 'active') throw new Error('Wallet account is not active');
        // if (smc.account.account === undefined || smc.account.account === null)
        //     throw new Error("Can't access wallet account!");
        // console.log('dexRouter max storage stats:', smc.account.account.storageStats.used);
        // const state = smc.accountState.state;
        // const stateCell = beginCell().store(storeStateInit(state)).endCell();
        // console.log('State init stats:', collectCellStats(stateCell, []));
    });

    it('should buy token with 10 tons', async () => {
        let tonReservesBefore = (await jettonMasterBondV1.getMasterData()).tonReserves;
        let jettonReservesBefore = (await jettonMasterBondV1.getMasterData()).jettonReserves;

        const buyer = await blockchain.treasury('buyer', { workchain: 0, balance: toNano('1000000') });
        let buyerTonBalanceBefore = await buyer.getBalance();
        let tonAmount = toNano('10');
        let sendAllTon = toNano('11');
        const buyTokenResult = await jettonMasterBondV1.sendBuyToken(
            buyer.getSender(),
            { value: sendAllTon },
            {
                $$type: 'BuyToken',
                query_id: 0n,
                ton_amount: tonAmount,
                minTokenOut: 0n,
                destination: buyer.address,
                response_address: buyer.address,
                custom_payload: null,
                forward_ton_amount: 0n,
                forward_payload: beginCell().storeUint(0n, 1).endCell(),
            },
        );
        let buyerTonBalanceAfter = await buyer.getBalance();

        // Calculate gas fee for buy token transaction
        // const buyMeMeTx = findTransactionRequired(buyTokenResult.transactions, {
        //     op: MasterOpocde.Mint,
        //     from: buyer.address,
        //     to: jettonMasterBondV1.address,
        //     success: true,
        // });
        // printTxGasStats('Buy Meme Jetton With TON', buyMeMeTx);

        // Expect that buyer send op::mint to jettonMasterBondV1
        expect(buyTokenResult.transactions).toHaveTransaction({
            op: MasterOpocde.Mint,
            from: buyer.address,
            to: jettonMasterBondV1.address,
            success: true,
        });

        // Expect jettonMasterBondV1 send internal transfer to buyer memejetonWallet
        let memejetonWalletAddress = await jettonMasterBondV1.getWalletAddress(buyer.address);
        expect(buyTokenResult.transactions).toHaveTransaction({
            op: MasterOpocde.InternalTransfer,
            from: jettonMasterBondV1.address,
            to: memejetonWalletAddress,
            success: true,
        });

        // Expect that buyers ton balance decreased at least tonAmount
        expect(buyerTonBalanceBefore - buyerTonBalanceAfter).toBeGreaterThanOrEqual(tonAmount);

        // Expect that buyers meme token balance increased tonAmount
        let buyerWallet = await userWallet(buyer.address, jettonMasterBondV1);
        let buyerMemeTokenBalance = await buyerWallet.getJettonBalance();

        let tonReservesAfter = (await jettonMasterBondV1.getMasterData()).tonReserves;
        let jettonReservesAfter = (await jettonMasterBondV1.getMasterData()).jettonReserves;

        // Expect that ton reserves is equal to 9900000000n
        expect(tonReservesAfter).toEqual(9900000000n);

        // Expect that jetton reserve is equal to 99019704921279334n
        expect(jettonReservesAfter).toEqual(99019704921279334n);

        // Expect that buyer received meme token
        expect(buyerMemeTokenBalance).toEqual(jettonReservesBefore - jettonReservesAfter);

        // Expect buyer meme token balance is equal to 980295078720666n
        expect(buyerMemeTokenBalance).toBe(980295078720666n);

        // Expect that ton reserves increased tonAmount * 90%
        expect(tonReservesAfter - tonReservesBefore).toEqual((tonAmount * (precision - fee_rate)) / precision);

        let feeAfter = (await jettonMasterBondV1.getMasterData()).fee;
        // Expect that fees increased tonAmount * 10%
        expect(feeAfter).toEqual((tonAmount * fee_rate) / precision);
    });

    it('should burn half of buyer meme tokens', async () => {
        const buyer = await blockchain.treasury('buyer', { workchain: 0, balance: toNano('1000000') });
        await buyToken(jettonMasterBondV1, buyer);

        let buyerWallet = await userWallet(buyer.address, jettonMasterBondV1);
        let buyerMemeTokenBalanceBefore = await buyerWallet.getJettonBalance();

        // Buyers burn half of meme tokens
        let buyerTonBalanceBefore = await buyer.getBalance();
        let burnAmount = buyerMemeTokenBalanceBefore / 2n;
        const burnResult = await buyerWallet.sendBurn(buyer.getSender(), toNano('1'), burnAmount, null, null);
        // const burnMeMeTx = findTransactionRequired(burnResult.transactions, {
        //     op: MasterOpocde.BurnNotification,
        //     from: buyerWallet.address,
        //     to: jettonMasterBondV1.address,
        //     success: true,
        // });
        // printTxGasStats('Burn Meme Jetton With TON', burnMeMeTx);
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

        // Expect ton reserves = 4925618189n
        expect(tonReservesAfter).toEqual(4925618189n);

        // Expect jetton reserves = 99509852460639667n
        expect(jettonReservesAfter).toEqual(99509852460639667n);

        // Expect that buyers ton balance increased at least 4924637993n
        let gas_fee = toNano('0.05');
        expect(buyerTonBalanceAfter - buyerTonBalanceBefore + gas_fee).toBeGreaterThanOrEqual(4924637993n);
    });

    it('should burn buyer meme tokens and send to the assigned recipient', async () => {
        const buyer = await blockchain.treasury('buyer', { workchain: 0, balance: toNano('1000000') });
        await buyToken(jettonMasterBondV1, buyer);

        let buyerWallet = await userWallet(buyer.address, jettonMasterBondV1);
        let buyerMemeTokenBalanceBefore = await buyerWallet.getJettonBalance();

        // Buyers burn half of meme tokens
        let buyerTonBalanceBefore = await buyer.getBalance();
        let burnAmount = buyerMemeTokenBalanceBefore / 2n;
        let deployerTonBalanceBefore = await deployer.getBalance();
        const burnResult = await buyerWallet.sendBurn(
            buyer.getSender(),
            toNano('1'),
            burnAmount,
            deployer.address,
            null,
        );
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

        // Expect ton reserves = 4925618189n
        expect(tonReservesAfter).toEqual(4925618189n);

        // Expect jetton reserves = 99509852460639667n
        expect(jettonReservesAfter).toEqual(99509852460639667n);

        // Expect that deployers ton balance increased at least 4924637993n
        let gas_fee = toNano('0.05');
        expect(deployerTonBalanceAfter - deployerTonBalanceBefore + gas_fee).toBeGreaterThanOrEqual(4924637993n);

        // Buyers ton balance should decrease at least gas fee
        expect(buyerTonBalanceBefore - buyerTonBalanceAfter).toBeGreaterThan(gas_fee);
    });

    it('should transfer tokens and tons to DexRouter after meeting TonTheMoon', async () => {
        let deployerTonBalanceBefore = await deployer.getBalance();
        const buyer = await blockchain.treasury('buyer', { workchain: 0, balance: toNano('10000000') });
        const buyTon = toNano('1000000');
        const toTheMoonResult = await buyToken(jettonMasterBondV1, buyer, buyTon);
        let deployerTonBalanceAfter = await deployer.getBalance();

        // Expect that jettonMasterBondV1 send internal transfer to DexRouter wallet
        let dexRouterWalletAddress = await jettonMasterBondV1.getWalletAddress(dexRouter.address);
        expect(toTheMoonResult.transactions).toHaveTransaction({
            op: MasterOpocde.InternalTransfer,
            from: jettonMasterBondV1.address,
            to: dexRouterWalletAddress,
            success: true,
        });

        const sendToDexRouterTx = findTransactionRequired(toTheMoonResult.transactions, {
            op: MasterOpocde.InternalTransfer,
            from: jettonMasterBondV1.address,
            to: dexRouterWalletAddress,
            success: true,
        });
        printTxGasStats('JM Send to Dex Router', sendToDexRouterTx);

        // Expect that dexRouterWallet send jetton notification to dexRouter
        expect(toTheMoonResult.transactions).toHaveTransaction({
            op: MasterOpocde.JettonNotification,
            from: dexRouterWalletAddress,
            to: dexRouter.address,
            success: true,
            //value: 9001000000000n, // 9000 ton + 1 ton for build pool and farm
        });

        const deployPoolTx = findTransactionRequired(toTheMoonResult.transactions, {
            op: MasterOpocde.JettonNotification,
            from: dexRouterWalletAddress,
            to: dexRouter.address,
            success: true,
        });
        printTxGasStats('Dex Router Deploy Pool:', deployPoolTx);

        // Expect that dexRouterWallet send excess to admin address
        expect(toTheMoonResult.transactions).toHaveTransaction({
            op: MasterOpocde.Excess,
            from: dexRouterWalletAddress,
            to: deployer.address,
            success: true,
            //value: 999034037987n, // admin fees
        });
        // Expect that deployer ton balance increased at least 1100 TON
        let gas_fee = toNano('0.05');
        expect(deployerTonBalanceAfter - deployerTonBalanceBefore + gas_fee).toBeGreaterThanOrEqual(toNano('1100'));

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
            //value: 989899955558577n, // This is remaining ton after buyer bought meme token
        });

        const burnMeMeTx = findTransactionRequired(toTheMoonResult.transactions, {
            op: MasterOpocde.Excess,
            from: buyerWallet.address,
            to: buyer.address,
            success: true,
        });
        printTxGasStats('Send TON Fee', burnMeMeTx);

        // buyers meme token balance should be 90909090909090910n
        let buyerMemeTokenBalance = await buyerWallet.getJettonBalance();
        expect(buyerMemeTokenBalance).toEqual(90909090909090910n);

        // Dex Ruoter meme token balance should be 7438016528925619
        let dexRouterWallet = await userWallet(dexRouter.address, jettonMasterBondV1);
        let dexRouterMemeTokenBalance = await dexRouterWallet.getJettonBalance();
        expect(dexRouterMemeTokenBalance).toEqual(7438016528925619n);

        // Expect jettonMasterBondV1 ton reserves = 0
        let tonReservesAfter = (await jettonMasterBondV1.getMasterData()).tonReserves;
        let jettonReservesAfter = (await jettonMasterBondV1.getMasterData()).jettonReserves;
        expect(tonReservesAfter).toEqual(0n);

        // Expect jettonMasterBondV1 jetton reserves = 0
        expect(jettonReservesAfter).toEqual(0n);

        // Expect fee = 0
        let feeAfter = (await jettonMasterBondV1.getMasterData()).fee;
        expect(feeAfter).toEqual(0n);

        // Epext that onMoon = 1n
        let onMoon = (await jettonMasterBondV1.getMasterData()).onMoon;
        expect(onMoon).toEqual(-1n);

        let dexRouterMemeWallet = await userWallet(dexRouter.address, jettonMasterBondV1);
        let poolAddress = await dexRouter.getPoolAddress(dexRouterMemeWallet.address, null);
        // Expect that Dex Router send deposit asset to Pool
        expect(toTheMoonResult.transactions).toHaveTransaction({
            op: MasterOpocde.DepositAsset,
            from: dexRouter.address,
            to: poolAddress,
            success: true,
        });

        // const depositAssetTx = findTransactionRequired(toTheMoonResult.transactions, {
        //     op: MasterOpocde.DepositAsset,
        //     from: dexRouter.address,
        //     to: poolAddress,
        //     success: true,
        // });
        // printTxGasStats('Pool Deposit Asset', depositAssetTx);
    });

    it('should buy meme tokens and sell meme tokens 100 times and ton the moon', async () => {
        let deployerTonBalanceBefore = await deployer.getBalance();
        let buyer = await blockchain.treasury('buyer', { workchain: 0, balance: toNano('100000000') });
        const buyTon = toNano('10');
        let buyerWallet = await userWallet(buyer.address, jettonMasterBondV1);

        // use for loop to buy and sell meme tokens 100 times
        for (let i = 0; i < 100; i++) {
            await buyToken(jettonMasterBondV1, buyer, buyTon);
            let burnAmount = await buyerWallet.getJettonBalance();
            await buyerWallet.sendBurn(buyer.getSender(), toNano('1'), burnAmount, null, null);
        }

        // Expect that ton reserves = 0
        let tonReservesAfter = (await jettonMasterBondV1.getMasterData()).tonReserves;
        expect(tonReservesAfter).toEqual(0n);

        // Expect that jetton reserves = 100000000000000000n
        let jettonReservesAfter = await (await jettonMasterBondV1.getMasterData()).jettonReserves;
        expect(jettonReservesAfter).toEqual(100000000000000000n);

        // Expect that fee = 19900000000n
        let feeAfter = await (await jettonMasterBondV1.getMasterData()).fee;
        expect(feeAfter).toEqual(19900000000n);

        // Ton the moon
        const buyTontoMoon = toNano('1000000');
        const toTheMoonResult = await buyToken(jettonMasterBondV1, buyer, buyTontoMoon);
        let deployerTonBalanceAfter = await deployer.getBalance();

        // printTransactionFees(toTheMoonResult.transactions);

        // Epext that onMoon = 1n
        let onMoon = (await jettonMasterBondV1.getMasterData()).onMoon;
        expect(onMoon).toEqual(-1n);

        // Expect that Dex Router send deposit asset to Pool
        let dexRouterMemeWallet = await userWallet(dexRouter.address, jettonMasterBondV1);
        let poolAddress = await dexRouter.getPoolAddress(dexRouterMemeWallet.address, null);
        expect(toTheMoonResult.transactions).toHaveTransaction({
            op: MasterOpocde.DepositAsset,
            from: dexRouter.address,
            to: poolAddress,
            success: true,
        });

        // Expect that dexRouterWallet send excess to admin address
        let dexRouterWalletAddress = await jettonMasterBondV1.getWalletAddress(dexRouter.address);
        expect(toTheMoonResult.transactions).toHaveTransaction({
            op: MasterOpocde.Excess,
            from: dexRouterWalletAddress,
            to: deployer.address,
            success: true,
        });

        // Expect that deployer ton balance increased at least feeAfter + 999TON ( 10% of ton reserves)
        let gas_fee = toNano('0.05');
        expect(deployerTonBalanceAfter - deployerTonBalanceBefore + gas_fee).toBeGreaterThanOrEqual(
            feeAfter + toNano('999'),
        );
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

    it('should not sell meme tokens after token on the list', async () => {
        const buyer = await blockchain.treasury('buyer', { workchain: 0, balance: toNano('10000000') });
        const buyTon = toNano('1000000');
        await buyToken(jettonMasterBondV1, buyer, buyTon);

        // buyer try to sell meme token after token on the list

        let buyerWallet = await userWallet(buyer.address, jettonMasterBondV1);
        let buyerMemeTokenBalanceBefore = await buyerWallet.getJettonBalance();

        // Buyers burn half of meme tokens
        let burnAmount = buyerMemeTokenBalanceBefore / 2n;
        const burnResult = await buyerWallet.sendBurn(buyer.getSender(), toNano('1'), burnAmount, null, null);
        let buyerMemeTokenBalanceAfter = await buyerWallet.getJettonBalance();

        // Expect to throw token already listed error
        expect(burnResult.transactions).toHaveTransaction({
            from: buyerWallet.address,
            to: jettonMasterBondV1.address,
            success: false,
            exitCode: 2002,
        });

        // Epect that buyer meme token balance is still same
        expect(buyerMemeTokenBalanceAfter).toEqual(buyerMemeTokenBalanceBefore);
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

    it('should throw invalid amount when buy ton amount is 0', async () => {
        const buyer = await blockchain.treasury('buyer', { workchain: 0, balance: toNano('10000000') });
        const buyTon = 0n;
        const invalidAmountResult = await buyToken(jettonMasterBondV1, buyer, buyTon);
        let buyerBeforeBalance = await buyer.getBalance();
        expect(invalidAmountResult.transactions).toHaveTransaction({
            op: MasterOpocde.Mint,
            from: buyer.address,
            to: jettonMasterBondV1.address,
            success: false,
            exitCode: 2003,
        });
        let buyerAfterBalance = await buyer.getBalance();

        // Expect buyer ton balance decreased only the gas fee
        let gas_fee = toNano('0.055');
        expect(buyerAfterBalance + gas_fee).toBeGreaterThan(buyerBeforeBalance);
    });

    it('should throw not enough ton error when sending ton is not enough', async () => {
        const buyer = await blockchain.treasury('buyer', { workchain: 0, balance: toNano('1000000') });
        let tonAmount = toNano('10');
        let sendAllTon = toNano('1');
        let buyerBeforeBalance = await buyer.getBalance();
        const notEnoughTonResult = await jettonMasterBondV1.sendBuyToken(
            buyer.getSender(),
            { value: sendAllTon },
            {
                $$type: 'BuyToken',
                query_id: 0n,
                ton_amount: tonAmount,
                minTokenOut: 0n,
                destination: buyer.address,
                response_address: buyer.address,
                custom_payload: null,
                forward_ton_amount: 0n,
                forward_payload: beginCell().storeUint(0n, 1).endCell(),
            },
        );
        let buyerAfterBalance = await buyer.getBalance();

        // Epect to throw not enough ton error
        expect(notEnoughTonResult.transactions).toHaveTransaction({
            op: MasterOpocde.Mint,
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
        let sendAllTon = tonAmount + toNano('1');
        let buyerBeforeBalance = await buyer.getBalance();
        const notEnoughTonResult = await jettonMasterBondV1.sendBuyToken(
            buyer.getSender(),
            { value: sendAllTon },
            {
                $$type: 'BuyToken',
                query_id: 0n,
                ton_amount: tonAmount,
                minTokenOut: toNano('1000000000000000000000'),
                destination: buyer.address,
                response_address: buyer.address,
                custom_payload: null,
                forward_ton_amount: 0n,
                forward_payload: beginCell().storeUint(0n, 1).endCell(),
            },
        );
        let buyerAfterBalance = await buyer.getBalance();

        // Epect to throw not enough ton error
        expect(notEnoughTonResult.transactions).toHaveTransaction({
            op: MasterOpocde.Mint,
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
            value: toNano('1'),
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
        const deployResult = await mockContract.sendDeploy(deployer.getSender(), toNano('1'));
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

    it('should admin can claim admin fee', async () => {
        const buyer = await blockchain.treasury('buyer', { workchain: 0, balance: toNano('10000000') });
        const buyTon = toNano('5000');
        await buyToken(jettonMasterBondV1, buyer, buyTon);

        const fee = (await jettonMasterBondV1.getMasterData()).fee;

        // Admin claim admin fee
        let deployerTonBalanceBefore = await deployer.getBalance();
        const claimResult = await jettonMasterBondV1.sendClaimFee(deployer.getSender(), toNano('0.05'));
        let deployerTonBalanceAfter = await deployer.getBalance();

        // Expect that depoyer send claim fee to jettonMasterBondV1
        expect(claimResult.transactions).toHaveTransaction({
            op: MasterOpocde.ClaimAdminFee,
            from: deployer.address,
            to: jettonMasterBondV1.address,
            success: true,
        });

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
        const claimResult = await jettonMasterBondV1.sendClaimFee(buyer.getSender(), toNano('0.05'));
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
    let dexRouter: SandboxContract<DexRouter>;
    let jettonMasterBondV1: SandboxContract<JettonMasterBondV1>;

    beforeEach(async () => {
        blockchain = await Blockchain.create();
        deployer = await blockchain.treasury('deployer', { workchain: 0, balance: toNano('100000000') });
    });

    const userWallet = async (address: Address, jettonMaster: SandboxContract<JettonMasterBondV1>) =>
        blockchain.openContract(JettonWallet.createFromAddress(await jettonMaster.getWalletAddress(address)));

    it('should deploy contract with premint', async () => {
        const jettonMasterBondV1Code = await compile(JettonMasterBondV1.name);
        const dexRouterCode = await compile(DexRouter.name);
        const jettonWalletCode = await compile(JettonWallet.name);
        const poolCode = await compile(PoolV1.name);

        const dexRouter = blockchain.openContract(
            DexRouter.createFromConfig(
                {
                    ownerAddress: deployer.address,
                    poolCode: poolCode,
                    lpWalletCode: jettonWalletCode,
                },
                dexRouterCode,
            ),
        );

        const deployDexRouterResult = await dexRouter.sendDeploy(deployer.getSender(), toNano('0.05'));
        expect(deployDexRouterResult.transactions).toHaveTransaction({
            from: deployer.address,
            to: dexRouter.address,
            deploy: true,
            success: true,
        });

        const jettonMasterBondV1 = blockchain.openContract(
            JettonMasterBondV1.createFromConfig(
                {
                    totalSupply: toNano('100000000'),
                    adminAddress: deployer.address,
                    tonReserves: 0n,
                    jettonReserves: toNano('100000000'),
                    fee: 0n,
                    onMoon: 0n,
                    dexRouter: dexRouter.address,
                    jettonWalletCode: jettonWalletCode,
                    jettonContent: beginCell().endCell(),
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
