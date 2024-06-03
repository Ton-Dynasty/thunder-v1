import { Blockchain, printTransactionFees, SandboxContract, TreasuryContract } from '@ton/sandbox';
import { Address, beginCell, Cell, storeStateInit, toNano, Transaction } from '@ton/core';
import { PoolV1, PoolOpcodes } from '../wrappers/PoolV1';
import { JettonWallet } from '../wrappers/JettonWallet';
import '@ton/test-utils';
import { compile } from '@ton/blueprint';
import { loadJMBondFixture, buyToken } from './helper';
import { DexRouter, SwapTon } from '../wrappers/DexRouter';
import { JettonMasterBondV1 } from '../wrappers/JettonMasterBondV1';
import { Op } from '../wrappers/JettonConstants';
import { collectCellStats, computedGeneric } from '../gasUtils';
import { findTransactionRequired } from '@ton/test-utils';
import { Maybe } from '@ton/core/dist/utils/maybe';

describe('PoolV1', () => {
    let blockchain: Blockchain;
    let deployer: SandboxContract<TreasuryContract>;
    let buyer: SandboxContract<TreasuryContract>;
    let poolV1: SandboxContract<PoolV1>;
    let poolV1Code: Cell;
    let jettonWalletCode: Cell;
    let dexRouter: SandboxContract<DexRouter>;
    let jettonMasterBondV1: SandboxContract<JettonMasterBondV1>;
    let printTxGasStats: (name: string, trans: Transaction) => bigint;

    const userWallet = async (address: Address, jettonMaster: SandboxContract<JettonMasterBondV1>) =>
        blockchain.openContract(JettonWallet.createFromAddress(await jettonMaster.getWalletAddress(address)));

    const provideJettonLiquidity = async (
        buyer: SandboxContract<TreasuryContract>,
        dexRouter: SandboxContract<DexRouter>,
        jettonMaster: SandboxContract<JettonMasterBondV1>,
        otherAssetWallet: Maybe<Address> = null,
        queryId: bigint = 0n,
        sendTonAmount: bigint = toNano('10'),
        sendJettonAmount: bigint = 10n * 10n ** 9n,
        forwardAmount: bigint = toNano('1'), // This is Gas Fee
        minLPAmount: bigint = 0n,
        recipient: Address | null = null,
    ) => {
        const buyerJettonWalletAddress = await jettonMaster.getWalletAddress(buyer.address);
        const message = DexRouter.packJettonTransfer({
            $$type: 'JettonTransfer',
            queryId: queryId,
            jettonAmount: sendJettonAmount,
            to: dexRouter.address,
            responseAddress: buyer.address,
            customPayload: null,
            forwardTonAmount: sendTonAmount + forwardAmount,
            forwardPayload: {
                $$type: 'AddLiquidityFP',
                otherAssetAmount: sendTonAmount,
                otherAssetWallet: otherAssetWallet,
                minLpAmount: minLPAmount,
                recipient: recipient,
                fulfillPayload: null,
                rejectPayload: null,
            },
        });

        return buyer.send({
            to: buyerJettonWalletAddress,
            value: sendTonAmount + forwardAmount * 2n,
            bounce: true,
            body: message,
            sendMode: 1,
        });
    };
    const swapJetton = async (
        buyer: SandboxContract<TreasuryContract>,
        dexRouter: SandboxContract<DexRouter>,
        jettonMaster: SandboxContract<JettonMasterBondV1>,
        otherAssetWallet: Maybe<Address> = null,
        jettonAmount: bigint = 10n * 10n ** 9n,
        minAmountOut: bigint = 0n,
        deadline: bigint = BigInt(Math.floor(Date.now() / 1000 + 60)),

        recipient: Maybe<Address> = null,
        next: Maybe<Cell> = null,
        extraPayload: Maybe<Cell> = null,
        fulfillPayload: Maybe<Cell> = null,
        rejectPayload: Maybe<Cell> = null,
        queryId: bigint = 999n,
    ) => {
        const buyerJettonWalletAddress = await jettonMaster.getWalletAddress(buyer.address);
        const message = DexRouter.packJettonTransfer({
            $$type: 'JettonTransfer',
            queryId: queryId,
            jettonAmount: jettonAmount,
            to: dexRouter.address,
            responseAddress: buyer.address,
            customPayload: null,
            forwardTonAmount: toNano('1'),
            forwardPayload: {
                $$type: 'SwapJettonFP',
                otherAssetWallet: otherAssetWallet,
                assetIn: 1n,
                minAmountOut: minAmountOut,
                deadline: deadline,
                recipient: recipient,
                next: next,
                extraPayload: extraPayload,
                fulfillPayload: fulfillPayload,
                rejectPayload: rejectPayload,
            },
        });

        return buyer.send({
            to: buyerJettonWalletAddress,
            value: toNano('1') * 2n,
            bounce: true,
            body: message,
            sendMode: 1,
        });
    };

    const swapTon = async (
        buyer: SandboxContract<TreasuryContract>,
        dexRouter: SandboxContract<DexRouter>,
        otherAssetWallet: Maybe<Address> = null,
        tonAmount: bigint = toNano('10'),
        minAmountOut: bigint = 0n,
        deadline: bigint = BigInt(Math.floor(Date.now() / 1000 + 60)),
        recipient: Maybe<Address> = null,
        next: Maybe<Cell> = null,
        extraPayload: Maybe<Cell> = null,
        fulfillPayload: Maybe<Cell> = null,
        rejectPayload: Maybe<Cell> = null,
        queryId: bigint = 999n,
    ) => {
        const message = DexRouter.packSwapTon({
            $$type: 'SwapTon',
            queryId: queryId,
            otherAssetWallet: otherAssetWallet,
            tonAmount: tonAmount,
            minAmountOut: minAmountOut,
            deadline: deadline,
            recipient: recipient,
            next: next,
            extraPayload: extraPayload,
            fulfillPayload: fulfillPayload,
            rejectPayload: rejectPayload,
        });

        return buyer.send({
            to: dexRouter.address,
            value: tonAmount + toNano('1'),
            bounce: true,
            body: message,
            sendMode: 1,
        });
    };

    const withdraw = async (
        buyer: SandboxContract<TreasuryContract>,
        pool: SandboxContract<PoolV1>,
        lpAmount: bigint,
        asset0MinAmount: bigint,
        asset1MinAmount: bigint,
        recipient: Maybe<Address> = null,
        fulfillPayload: Maybe<Cell> = null,
        rejectPayload: Maybe<Cell> = null,
        queryId: bigint = 1111n,
    ) => {
        let buyerLpWalletAddress = await poolV1.getWalletAddress(buyer.address);
        const message = PoolV1.packJettonTransfer({
            $$type: 'JettonTransfer',
            queryId: queryId,
            jettonAmount: lpAmount,
            to: pool.address,
            responseAddress: buyer.address,
            customPayload: null,
            forwardTonAmount: toNano('1'),
            forwardPayload: {
                $$type: 'WithdrawFP',
                asset0MinAmount: asset0MinAmount,
                asset1MinAmount: asset1MinAmount,
                recipient: recipient,
                fulfillPayload: fulfillPayload,
                rejectPayload: rejectPayload,
            },
        });

        return buyer.send({
            to: buyerLpWalletAddress,
            value: toNano('1') * 2n,
            bounce: true,
            body: message,
            sendMode: 1,
        });
    };

    beforeAll(async () => {
        poolV1Code = await compile(PoolV1.name);
        jettonWalletCode = await compile(JettonWallet.name);
        printTxGasStats = (name, transaction) => {
            const txComputed = computedGeneric(transaction);
            console.log(`${name} used ${txComputed.gasUsed} gas`);
            console.log(`${name} gas cost: ${txComputed.gasFees}`);
            return txComputed.gasFees;
        };
    });

    beforeEach(async () => {
        blockchain = await Blockchain.create();
        deployer = await blockchain.treasury('deployer');

        ({ blockchain, deployer, dexRouter, jettonMasterBondV1 } = await loadJMBondFixture());
        buyer = await blockchain.treasury('buyer', { workchain: 0, balance: toNano('10000000') });
        const buyTon = toNano('1000000');
        await buyToken(jettonMasterBondV1, buyer, buyTon);
        let dexRouterMemeWallet = await userWallet(dexRouter.address, jettonMasterBondV1);
        let poolAddress = await dexRouter.getPoolAddress(dexRouterMemeWallet.address, null);
        poolV1 = blockchain.openContract(PoolV1.createFromAddress(poolAddress));
    });

    it('should deploy', async () => {
        // the check is done inside beforeEach
        // blockchain and poolV1 are ready to use
        // Calculate Jetton Master Bond contract gas fee
        // const smc = await blockchain.getContract(poolV1.address);
        // if (smc.accountState === undefined) throw new Error("Can't access wallet account state");
        // if (smc.accountState.type !== 'active') throw new Error('Wallet account is not active');
        // if (smc.account.account === undefined || smc.account.account === null)
        //     throw new Error("Can't access wallet account!");
        // console.log('Pool max storage stats:', smc.account.account.storageStats.used);
        // const state = smc.accountState.state;
        // const stateCell = beginCell().store(storeStateInit(state)).endCell();
        // console.log('State init stats:', collectCellStats(stateCell, []));
    });

    it('should add liquidity', async () => {
        const sendTonAmount = toNano('10');
        const sendJettonAmount = 10n * 10n ** 9n;
        const forwardAmount = toNano('1');
        const minLPAmount = 0n;
        const recipient = null;

        // After ton the moon, the lp amount should be 258731808559n
        let totalSupplyBefore = (await poolV1.getPoolData()).totalSupply;
        expect(totalSupplyBefore).toEqual(258731808559n);

        // get buyer's LP wallet balance before
        let buyerLpWalletAddress = await poolV1.getWalletAddress(buyer.address);
        let buyerLpWallet = blockchain.openContract(JettonWallet.createFromAddress(buyerLpWalletAddress));
        let buyerLpWalletBalanceBefore = await buyerLpWallet.getJettonBalance();

        // get buyer's Jetton wallet balance before
        let buyerJettonWalletAddress = await jettonMasterBondV1.getWalletAddress(buyer.address);
        let dexRouterWalletAddress = await jettonMasterBondV1.getWalletAddress(dexRouter.address);
        let buyerJettonWallet = blockchain.openContract(JettonWallet.createFromAddress(buyerJettonWalletAddress));
        let buyerJettonWalletBalanceBefore = await buyerJettonWallet.getJettonBalance();

        const queryId = 0n;
        const result = await provideJettonLiquidity(
            buyer,
            dexRouter,
            jettonMasterBondV1,
            null,
            queryId,
            sendTonAmount,
            sendJettonAmount,
            forwardAmount,
            minLPAmount,
            recipient,
        );

        // Expect that buyer meme wallet send jetton internal transfer to dex router
        expect(result.transactions).toHaveTransaction({
            op: PoolOpcodes.InternalTransfer,
            from: buyerJettonWalletAddress,
            to: dexRouterWalletAddress,
            success: true,
        });

        // Expect that dexRouter Wallet send Jetton Notification dex router
        expect(result.transactions).toHaveTransaction({
            op: PoolOpcodes.JettonNotification,
            from: dexRouterWalletAddress,
            to: dexRouter.address,
            success: true,
        });

        // Expect the Dex Router send deposit asset to pool
        expect(result.transactions).toHaveTransaction({
            op: PoolOpcodes.Deposit,
            from: dexRouter.address,
            to: poolV1.address,
            success: true,
        });

        // const depositAssetTx = findTransactionRequired(result.transactions, {
        //     op: PoolOpcodes.Deposit,
        //     from: dexRouter.address,
        //     to: poolV1.address,
        //     success: true,
        // });
        // printTxGasStats('Burn Meme Jetton With TON', depositAssetTx);

        // Expect that pool send LP token to buyer LP wallet
        expect(result.transactions).toHaveTransaction({
            op: PoolOpcodes.InternalTransfer,
            from: poolV1.address,
            to: buyerLpWalletAddress,
            success: true,
        });

        // Expect that buyer LP wallet balance increased totalSupplyAfter - totalSupplyBefore
        let buyerLpWalletBalanceAfter = await buyerLpWallet.getJettonBalance();
        let totalSupplyAfter = (await poolV1.getPoolData()).totalSupply;
        expect(buyerLpWalletBalanceAfter).toEqual(totalSupplyAfter - totalSupplyBefore);

        // totalSupply after should be 258732156409
        expect(totalSupplyAfter).toEqual(258732156409n);

        // Expect that buyer Jetton wallet balance decreased
        let buyerJettonWalletBalanceAfter = await buyerJettonWallet.getJettonBalance();
        expect(buyerJettonWalletBalanceAfter + sendJettonAmount).toEqual(buyerJettonWalletBalanceBefore);

        // Expect pool reserve 0 should be 9010000000000
        let reserve0After = (await poolV1.getPoolData()).reserve0;
        expect(reserve0After).toEqual(9010000000000n);

        // Expect pool reserve 1 should be 7438026528925619
        let reserve1After = (await poolV1.getPoolData()).reserve1;
        expect(reserve1After).toEqual(7438026528925619n);
    });

    it('should add liquidity but min lp amount does not meet', async () => {
        const sendTonAmount = toNano('10');
        const sendJettonAmount = 10n * 10n ** 9n;
        const forwardAmount = toNano('1');
        const minLPAmount = 10n * 10n ** 9n;
        const recipient = null;

        // After ton the moon, the lp amount should be 258731808559n
        let totalSupplyBefore = (await poolV1.getPoolData()).totalSupply;
        expect(totalSupplyBefore).toEqual(258731808559n);

        // get buyer's TON balance before
        let buyerTonBalanceBefore = await buyer.getBalance();

        // get buyer's Jetton wallet balance before
        let buyerJettonWalletAddress = await jettonMasterBondV1.getWalletAddress(buyer.address);
        let buyerJettonWallet = blockchain.openContract(JettonWallet.createFromAddress(buyerJettonWalletAddress));
        let buyerJettonWalletBalanceBefore = await buyerJettonWallet.getJettonBalance();

        const queryId = 0n;
        const result = await provideJettonLiquidity(
            buyer,
            dexRouter,
            jettonMasterBondV1,
            null,
            queryId,
            sendTonAmount,
            sendJettonAmount,
            forwardAmount,
            minLPAmount,
            recipient,
        );

        // Expect that pool send PayoutFromPool to Dex Router
        expect(result.transactions).toHaveTransaction({
            op: PoolOpcodes.PayoutFromPool,
            from: poolV1.address,
            to: dexRouter.address,
            success: true,
        });

        // Expect that dex router send excess message to buyer
        expect(result.transactions).toHaveTransaction({
            op: PoolOpcodes.Excess,
            from: dexRouter.address,
            to: buyer.address,
            success: true,
        });

        // Expect that buyer receive refund ton
        let gas_fee = toNano('1');
        let buyerTonBalanceAfter = await buyer.getBalance();
        expect(buyerTonBalanceAfter).toBeGreaterThan(buyerTonBalanceBefore - gas_fee);

        // Expect that dex router meme wallet send jetton internal transfer to buyer jetton wallet
        let dexRouterWalletAddress = await jettonMasterBondV1.getWalletAddress(dexRouter.address);
        expect(result.transactions).toHaveTransaction({
            op: PoolOpcodes.InternalTransfer,
            from: dexRouterWalletAddress,
            to: buyerJettonWalletAddress,
            success: true,
        });

        // Expect that buyer meme jetton balance is still the same
        let buyerJettonWalletBalanceAfter = await buyerJettonWallet.getJettonBalance();
        expect(buyerJettonWalletBalanceAfter).toEqual(buyerJettonWalletBalanceBefore);
    });

    it('should throw error when wrong sender send packout form pool to dex router', async () => {
        let dexRouterMemeWallet = await userWallet(dexRouter.address, jettonMasterBondV1);
        let body = beginCell()
            .storeUint(0x23a14fb2, 32)
            .storeUint(0, 64)
            .storeAddress(buyer.address)
            .storeAddress(dexRouterMemeWallet.address)
            .storeAddress(null)
            .storeCoins(10n)
            .storeAddress(buyer.address)
            .storeMaybeRef(null)
            .endCell();

        let invalidSenderResult = await buyer.send({
            to: dexRouter.address,
            value: toNano('1'),
            bounce: true,
            body: body,
            sendMode: 0,
        });

        // Expect that throw invalid sender error
        expect(invalidSenderResult.transactions).toHaveTransaction({
            from: buyer.address,
            to: dexRouter.address,
            success: false,
            exitCode: 2001,
        });
    });

    it('should not add liquidity when sending not enough ton', async () => {
        const sendTonAmount = toNano('10');
        const addLiquidityAmount = toNano('100');
        const sendJettonAmount = 10n * 10n ** 9n;
        const gas_fee = toNano('1');
        const minLPAmount = 0n;
        const recipient = null;

        // get buyer's LP wallet balance before
        let buyerLpWalletAddress = await poolV1.getWalletAddress(buyer.address);
        let buyerLpWallet = blockchain.openContract(JettonWallet.createFromAddress(buyerLpWalletAddress));
        let buyerLpWalletBalanceBefore = await buyerLpWallet.getJettonBalance();

        // get buyer's Jetton wallet balance before
        let buyerJettonWalletAddress = await jettonMasterBondV1.getWalletAddress(buyer.address);
        let dexRouterWalletAddress = await jettonMasterBondV1.getWalletAddress(dexRouter.address);

        let buyerJettonWallet = blockchain.openContract(JettonWallet.createFromAddress(buyerJettonWalletAddress));
        let buyerJettonWalletBalanceBefore = await buyerJettonWallet.getJettonBalance();

        const queryId = 0n;
        const message = DexRouter.packJettonTransfer({
            $$type: 'JettonTransfer',
            queryId: queryId,
            jettonAmount: sendJettonAmount,
            to: dexRouter.address,
            responseAddress: buyer.address,
            customPayload: null,
            forwardTonAmount: sendTonAmount + gas_fee, // Need 10 TON to add liquidity but only transfer 10 TON
            forwardPayload: {
                $$type: 'AddLiquidityFP',
                otherAssetAmount: addLiquidityAmount,
                otherAssetWallet: null,
                minLpAmount: minLPAmount,
                recipient: recipient,
                fulfillPayload: null,
                rejectPayload: null,
            },
        });

        const sendNotEnoughResult = await buyer.send({
            to: buyerJettonWalletAddress,
            value: sendTonAmount + gas_fee * 2n,
            bounce: true,
            body: message,
            sendMode: 1,
        });

        // Dex Router should send jetton transfer to Dex Router Wallet
        expect(sendNotEnoughResult.transactions).toHaveTransaction({
            op: PoolOpcodes.Transfer,
            from: dexRouter.address,
            to: dexRouterWalletAddress,
            success: true,
        });

        // Expect that Dex Router Wallet send Jetton Internal Transfer to buyer Jetton Wallet
        expect(sendNotEnoughResult.transactions).toHaveTransaction({
            op: PoolOpcodes.InternalTransfer,
            from: dexRouterWalletAddress,
            to: buyerJettonWalletAddress,
            success: true,
        });

        // Expect that buyer Jetton Wallet balance is still the same
        let buyerJettonWalletBalanceAfter = await buyerJettonWallet.getJettonBalance();
        expect(buyerJettonWalletBalanceAfter).toEqual(buyerJettonWalletBalanceBefore);

        // buyer should not receive LP, so buyer lp wallet balance is still the same
        let buyerLpWalletBalanceAfter = await buyerLpWallet.getJettonBalance();
        expect(buyerLpWalletBalanceAfter).toEqual(buyerLpWalletBalanceBefore);
    });

    it('should swap jetton to ton', async () => {
        const sendJettonAmount = 1000n * 10n ** 9n;
        const minAmountOut = 0n;
        const deadline = BigInt(Math.floor(Date.now() / 1000 + 60));

        // get buyer's Ton balance before
        let buyerTonBalanceBefore = await buyer.getBalance();

        // get buyer's Jetton wallet balance before
        let buyerJettonWalletAddress = await jettonMasterBondV1.getWalletAddress(buyer.address);
        let dexRouterWalletAddress = await jettonMasterBondV1.getWalletAddress(dexRouter.address);
        let buyerJettonWallet = blockchain.openContract(JettonWallet.createFromAddress(buyerJettonWalletAddress));
        let buyerJettonWalletBalanceBefore = await buyerJettonWallet.getJettonBalance();

        // get pool data before
        let poolDataBefore = await poolV1.getPoolData();

        const result = await swapJetton(
            buyer,
            dexRouter,
            jettonMasterBondV1,
            null,
            sendJettonAmount,
            minAmountOut,
            deadline,
        );

        // get buyer's Ton balance after
        let buyerTonBalanceAfter = await buyer.getBalance();
        // TODO: calculate actual value
        expect(buyerTonBalanceAfter).toBeGreaterThan(buyerTonBalanceBefore + minAmountOut);

        // get buyer's Jetton wallet balance after
        let buyerJettonWalletBalanceAfter = await buyerJettonWallet.getJettonBalance();
        expect(buyerJettonWalletBalanceAfter).toEqual(buyerJettonWalletBalanceBefore - sendJettonAmount);

        // get pool data after
        let poolDataAfter = await poolV1.getPoolData();
        expect(poolDataAfter.totalSupply).toEqual(poolDataBefore.totalSupply);
        expect(poolDataAfter.reserve1).toEqual(poolDataBefore.reserve1 + sendJettonAmount);
        // TODO: calculate actual value
        expect(poolDataAfter.reserve0).toBeLessThan(poolDataBefore.reserve0 - minAmountOut);

        // Expect that buyer Jetton Wallet send Jetton Transfer to Dex Router Jetton Wallet
        expect(result.transactions).toHaveTransaction({
            op: PoolOpcodes.InternalTransfer,
            from: buyerJettonWalletAddress,
            to: dexRouterWalletAddress,
            success: true,
        });

        // Expect that Dex Router Jetton Wallet send Jetton Notification to Dex Router
        expect(result.transactions).toHaveTransaction({
            op: PoolOpcodes.JettonNotification,
            from: dexRouterWalletAddress,
            to: dexRouter.address,
            success: true,
        });

        // Expect that Dex Router send Swap Internal to Pool
        expect(result.transactions).toHaveTransaction({
            op: PoolOpcodes.SwapInternal,
            from: dexRouter.address,
            to: poolV1.address,
            success: true,
        });

        // Expect that Pool send Ton PayoutFromPool to Dex Router
        expect(result.transactions).toHaveTransaction({
            op: PoolOpcodes.PayoutFromPool,
            from: poolV1.address,
            to: dexRouter.address,
            success: true,
        });

        // Expect that Dex Router send Excess to buyer
        expect(result.transactions).toHaveTransaction({
            op: PoolOpcodes.Excess,
            from: dexRouter.address,
            to: buyer.address,
            success: true,
        });
    });

    it('should send back swap in asset (jetton) when now > deadline', async () => {
        const sendJettonAmount = 1000n * 10n ** 9n;
        const minAmountOut = 0n;
        const deadline = BigInt(Math.floor(Date.now() / 1000 - 60));

        // get buyer's Jetton wallet balance before
        let buyerJettonWalletAddress = await jettonMasterBondV1.getWalletAddress(buyer.address);
        let dexRouterWalletAddress = await jettonMasterBondV1.getWalletAddress(dexRouter.address);
        let buyerJettonWallet = blockchain.openContract(JettonWallet.createFromAddress(buyerJettonWalletAddress));
        let buyerJettonWalletBalanceBefore = await buyerJettonWallet.getJettonBalance();

        // get pool data before
        let poolDataBefore = await poolV1.getPoolData();

        const result = await swapJetton(
            buyer,
            dexRouter,
            jettonMasterBondV1,
            null,
            sendJettonAmount,
            minAmountOut,
            deadline,
        );

        let poolDataAfter = await poolV1.getPoolData();

        // Expect that pool reserve 0 should be the same
        expect(poolDataAfter.reserve0).toEqual(poolDataBefore.reserve0);

        // Expect that pool reserve 1 should be the same
        expect(poolDataAfter.reserve1).toEqual(poolDataBefore.reserve1);

        // Expect that total supply should be the same
        expect(poolDataAfter.totalSupply).toEqual(poolDataBefore.totalSupply);

        // Expect that pool send packout from pool to dex router
        expect(result.transactions).toHaveTransaction({
            op: PoolOpcodes.PayoutFromPool,
            from: poolV1.address,
            to: dexRouter.address,
            success: true,
        });

        // Expect that dex router send transfer to dex router wallet
        expect(result.transactions).toHaveTransaction({
            op: PoolOpcodes.Transfer,
            from: dexRouter.address,
            to: dexRouterWalletAddress,
            success: true,
        });

        // Expect that dex router wallet send internal transfer to buyer jetton wallet
        expect(result.transactions).toHaveTransaction({
            op: PoolOpcodes.InternalTransfer,
            from: dexRouterWalletAddress,
            to: buyerJettonWalletAddress,
            success: true,
        });

        // Expect that buyer's meme wallet balance is still the same
        let buyerMemeWalletBalanceAfter = await buyerJettonWallet.getJettonBalance();
        expect(buyerMemeWalletBalanceAfter).toEqual(buyerJettonWalletBalanceBefore);
    });

    it('should swap ton to jetton', async () => {
        const sendTonAmount = toNano('10');
        const minAmountOut = 0n;
        const deadline = BigInt(Math.floor(Date.now() / 1000 + 60));

        // get buyer's Ton balance before
        let buyerTonBalanceBefore = await buyer.getBalance();

        // get buyer's Jetton wallet balance before
        let buyerJettonWalletAddress = await jettonMasterBondV1.getWalletAddress(buyer.address);
        let dexRouterWalletAddress = await jettonMasterBondV1.getWalletAddress(dexRouter.address);
        let buyerJettonWallet = blockchain.openContract(JettonWallet.createFromAddress(buyerJettonWalletAddress));
        let buyerJettonWalletBalanceBefore = await buyerJettonWallet.getJettonBalance();

        // get pool data before
        let poolDataBefore = await poolV1.getPoolData();

        const result = await swapTon(buyer, dexRouter, dexRouterWalletAddress, sendTonAmount, minAmountOut, deadline);

        // get buyer's Ton balance after
        let buyerTonBalanceAfter = await buyer.getBalance();
        expect(buyerTonBalanceAfter).toBeLessThan(buyerTonBalanceBefore - sendTonAmount);

        // get buyer's Jetton wallet balance after
        let buyerJettonWalletBalanceAfter = await buyerJettonWallet.getJettonBalance();
        // TODO: calculate actual value
        expect(buyerJettonWalletBalanceAfter).toBeGreaterThan(buyerJettonWalletBalanceBefore + minAmountOut);

        // get pool data after
        let poolDataAfter = await poolV1.getPoolData();
        expect(poolDataAfter.totalSupply).toEqual(poolDataBefore.totalSupply);
        expect(poolDataAfter.reserve0).toEqual(poolDataBefore.reserve0 + sendTonAmount);
        // TODO: calculate actual value
        expect(poolDataAfter.reserve1).toBeLessThan(poolDataBefore.reserve1 - minAmountOut);

        // Expect that buyer send Swap Ton to Dex Router
        expect(result.transactions).toHaveTransaction({
            op: PoolOpcodes.SwapTon,
            from: buyer.address,
            to: dexRouter.address,
            success: true,
        });

        // Expect that Dex Router send Swap Internal to Pool
        expect(result.transactions).toHaveTransaction({
            op: PoolOpcodes.SwapInternal,
            from: dexRouter.address,
            to: poolV1.address,
            success: true,
        });

        // Expect that Pool send Jetton PayoutFromPool to Dex Router
        expect(result.transactions).toHaveTransaction({
            op: PoolOpcodes.PayoutFromPool,
            from: poolV1.address,
            to: dexRouter.address,
            success: true,
        });

        // Expect that Dex Router send Jetton Transfer to Dex Router Jetton Wallet
        expect(result.transactions).toHaveTransaction({
            op: PoolOpcodes.Transfer,
            from: dexRouter.address,
            to: dexRouterWalletAddress,
            success: true,
        });

        // Expect that Dex Router Jetton Wallet send Internal Transfer to buyer Jetton Wallet
        expect(result.transactions).toHaveTransaction({
            op: PoolOpcodes.InternalTransfer,
            from: dexRouterWalletAddress,
            to: buyerJettonWalletAddress,
            success: true,
        });

        // Expect that buyer Jetton Wallet send Excess to buyer
        expect(result.transactions).toHaveTransaction({
            op: PoolOpcodes.Excess,
            from: buyerJettonWalletAddress,
            to: buyer.address,
            success: true,
        });
    });

    it('should send back swap in asset (ton) when now > deadline', async () => {
        const sendTonAmount = toNano('10');
        const minAmountOut = 0n;
        const deadline = BigInt(Math.floor(Date.now() / 1000 - 60));

        // get buyer's Ton balance before
        let buyerTonBalanceBefore = await buyer.getBalance();
        let dexRouterWalletAddress = await jettonMasterBondV1.getWalletAddress(dexRouter.address);
        let poolDataBefore = await poolV1.getPoolData();

        const result = await swapTon(buyer, dexRouter, dexRouterWalletAddress, sendTonAmount, minAmountOut, deadline);
        let poolDataAfter = await poolV1.getPoolData();

        // Expect that pool reserve 0 should be the same
        expect(poolDataAfter.reserve0).toEqual(poolDataBefore.reserve0);

        // Expect that pool reserve 1 should be the same
        expect(poolDataAfter.reserve1).toEqual(poolDataBefore.reserve1);

        // Expect that total supply should be the same
        expect(poolDataAfter.totalSupply).toEqual(poolDataBefore.totalSupply);

        // Expect that pool send packout from pool to dex router
        expect(result.transactions).toHaveTransaction({
            op: PoolOpcodes.PayoutFromPool,
            from: poolV1.address,
            to: dexRouter.address,
            success: true,
        });

        // Expect that dex router send excess to buyer
        expect(result.transactions).toHaveTransaction({
            op: PoolOpcodes.Excess,
            from: dexRouter.address,
            to: buyer.address,
            success: true,
        });

        // get buyer's Ton balance after
        let buyerTonBalanceAfter = await buyer.getBalance();
        let gas_fee = toNano('0.5');
        expect(buyerTonBalanceAfter).toBeGreaterThan(buyerTonBalanceBefore - gas_fee);
    });

    it('should send swap asset (TON) back when min lp did not meet', async () => {
        const sendTonAmount = toNano('10');
        const minAmountOut = toNano('10000');
        const deadline = BigInt(Math.floor(Date.now() / 1000 + 60));

        // get buyer's Ton balance before
        let buyerTonBalanceBefore = await buyer.getBalance();

        // get pool data before
        let poolDataBefore = await poolV1.getPoolData();

        let dexRouterWalletAddress = await jettonMasterBondV1.getWalletAddress(dexRouter.address);
        const result = await swapTon(buyer, dexRouter, dexRouterWalletAddress, sendTonAmount, minAmountOut, deadline);
        let poolDataAfter = await poolV1.getPoolData();

        // Expect that pool reserve 0 should be the same
        expect(poolDataAfter.reserve0).toEqual(poolDataBefore.reserve0);

        // Expect that pool reserve 1 should be the same
        expect(poolDataAfter.reserve1).toEqual(poolDataBefore.reserve1);

        // Expect that total supply should be the same
        expect(poolDataAfter.totalSupply).toEqual(poolDataBefore.totalSupply);

        // Expect that pool send packout from pool to dex router
        expect(result.transactions).toHaveTransaction({
            op: PoolOpcodes.PayoutFromPool,
            from: poolV1.address,
            to: dexRouter.address,
            success: true,
        });

        // Expect that dex router send excess to buyer
        expect(result.transactions).toHaveTransaction({
            op: PoolOpcodes.Excess,
            from: dexRouter.address,
            to: buyer.address,
            success: true,
        });

        // get buyer's Ton balance after
        let buyerTonBalanceAfter = await buyer.getBalance();
        let gas_fee = toNano('0.5');
        expect(buyerTonBalanceAfter).toBeGreaterThan(buyerTonBalanceBefore - gas_fee);
    });

    it('should send swap asset (Jetton) back when min lp did not meet', async () => {
        const sendJettonAmount = 1000n * 10n ** 9n;
        const minAmountOut = toNano('1000000');
        const deadline = BigInt(Math.floor(Date.now() / 1000 + 60));

        // get buyer's Jetton wallet balance before
        let buyerJettonWalletAddress = await jettonMasterBondV1.getWalletAddress(buyer.address);
        let dexRouterWalletAddress = await jettonMasterBondV1.getWalletAddress(dexRouter.address);
        let buyerJettonWallet = blockchain.openContract(JettonWallet.createFromAddress(buyerJettonWalletAddress));
        let buyerJettonWalletBalanceBefore = await buyerJettonWallet.getJettonBalance();

        // get pool data before
        let poolDataBefore = await poolV1.getPoolData();

        const result = await swapJetton(
            buyer,
            dexRouter,
            jettonMasterBondV1,
            null,
            sendJettonAmount,
            minAmountOut,
            deadline,
        );

        let poolDataAfter = await poolV1.getPoolData();

        // Expect that pool reserve 0 should be the same
        expect(poolDataAfter.reserve0).toEqual(poolDataBefore.reserve0);

        // Expect that pool reserve 1 should be the same
        expect(poolDataAfter.reserve1).toEqual(poolDataBefore.reserve1);

        // Expect that total supply should be the same
        expect(poolDataAfter.totalSupply).toEqual(poolDataBefore.totalSupply);

        // Expect that pool send packout from pool to dex router
        expect(result.transactions).toHaveTransaction({
            op: PoolOpcodes.PayoutFromPool,
            from: poolV1.address,
            to: dexRouter.address,
            success: true,
        });

        // Expect that dex router send transfer to dex router wallet
        expect(result.transactions).toHaveTransaction({
            op: PoolOpcodes.Transfer,
            from: dexRouter.address,
            to: dexRouterWalletAddress,
            success: true,
        });

        // Expect that dex router wallet send internal transfer to buyer jetton wallet
        expect(result.transactions).toHaveTransaction({
            op: PoolOpcodes.InternalTransfer,
            from: dexRouterWalletAddress,
            to: buyerJettonWalletAddress,
            success: true,
        });

        // Expect that buyer's meme wallet balance is still the same
        let buyerMemeWalletBalanceAfter = await buyerJettonWallet.getJettonBalance();
        expect(buyerMemeWalletBalanceAfter).toEqual(buyerJettonWalletBalanceBefore);
    });

    it('should withdraw', async () => {
        // Need to add liquidity first
        const sendTonAmount = toNano('1000');
        const sendJettonAmount = 1000000n * 10n ** 9n;

        await provideJettonLiquidity(buyer, dexRouter, jettonMasterBondV1, null, 999n, sendTonAmount, sendJettonAmount);

        const lpAmount = 1n * 10n ** 9n;
        const asset0MinAmount = 0n;
        const asset1MinAmount = 0n;

        // get buyer's LP wallet balance before
        let buyerLpWalletAddress = await poolV1.getWalletAddress(buyer.address);
        let poolLpWalletAddress = await poolV1.getWalletAddress(poolV1.address);
        let buyerLpWallet = blockchain.openContract(JettonWallet.createFromAddress(buyerLpWalletAddress));
        let buyerLpWalletBalanceBefore = await buyerLpWallet.getJettonBalance();

        // get buyer's Ton balance before
        let buyerTonBalanceBefore = await buyer.getBalance();

        // get buyer's Jetton wallet balance before
        let buyerJettonWalletAddress = await jettonMasterBondV1.getWalletAddress(buyer.address);
        let dexRouterWalletAddress = await jettonMasterBondV1.getWalletAddress(dexRouter.address);
        let buyerJettonWallet = blockchain.openContract(JettonWallet.createFromAddress(buyerJettonWalletAddress));
        let buyerJettonWalletBalanceBefore = await buyerJettonWallet.getJettonBalance();

        // get pool data before
        let poolDataBefore = await poolV1.getPoolData();

        const result = await withdraw(buyer, poolV1, lpAmount, asset0MinAmount, asset1MinAmount);

        // get buyer's LP wallet balance after
        let buyerLpWalletBalanceAfter = await buyerLpWallet.getJettonBalance();
        expect(buyerLpWalletBalanceAfter).toEqual(buyerLpWalletBalanceBefore - lpAmount);

        // get buyer's Ton balance after
        let buyerTonBalanceAfter = await buyer.getBalance();
        // TODO: calculate actual value
        expect(buyerTonBalanceAfter).toBeGreaterThan(buyerTonBalanceBefore);

        // get buyer's Jetton wallet balance after
        let buyerJettonWalletBalanceAfter = await buyerJettonWallet.getJettonBalance();
        // TODO: calculate actual value
        expect(buyerJettonWalletBalanceAfter).toBeGreaterThan(buyerJettonWalletBalanceBefore);

        // get pool data after
        let poolDataAfter = await poolV1.getPoolData();
        expect(poolDataAfter.totalSupply).toEqual(poolDataBefore.totalSupply - lpAmount);
        // TODO: calculate actual value
        expect(poolDataAfter.reserve0).toBeLessThanOrEqual(poolDataBefore.reserve0 - asset0MinAmount);
        expect(poolDataAfter.reserve1).toBeLessThanOrEqual(poolDataBefore.reserve1 - asset1MinAmount);

        // Expect that buyer send Jetton Transfer to buyer LP wallet
        expect(result.transactions).toHaveTransaction({
            op: PoolOpcodes.Transfer,
            from: buyer.address,
            to: buyerLpWalletAddress,
            success: true,
        });

        // Expect that buyer LP wallet send Internal Transfer to Pool Lp Wallet
        expect(result.transactions).toHaveTransaction({
            op: PoolOpcodes.InternalTransfer,
            from: buyerLpWalletAddress,
            to: poolLpWalletAddress,
            success: true,
        });

        // Expect that Pool Lp Wallet send Jetton Notification to Pool
        expect(result.transactions).toHaveTransaction({
            op: PoolOpcodes.JettonNotification,
            from: poolLpWalletAddress,
            to: poolV1.address,
            success: true,
        });

        // Expect that Pool send payout from pool to Dex Router
        expect(result.transactions).toHaveTransaction({
            op: PoolOpcodes.PayoutFromPool,
            from: poolV1.address,
            to: dexRouter.address,
            success: true,
        });

        // Expect that Dex Router send excess to buyer
        expect(result.transactions).toHaveTransaction({
            op: PoolOpcodes.Excess,
            from: dexRouter.address,
            to: buyer.address,
            success: true,
        });

        // Expect that Dex Router send Transfer to Dex Jetton Wallet
        expect(result.transactions).toHaveTransaction({
            op: PoolOpcodes.Transfer,
            from: dexRouter.address,
            to: dexRouterWalletAddress,
            success: true,
        });

        // Expect that Dex Router Wallet send Internal Transfer to buyer Jetton Wallet
        expect(result.transactions).toHaveTransaction({
            op: PoolOpcodes.InternalTransfer,
            from: dexRouterWalletAddress,
            to: buyerJettonWalletAddress,
            success: true,
        });

        // Expect that buyer Jetton Wallet send excess to buyer
        expect(result.transactions).toHaveTransaction({
            op: PoolOpcodes.Excess,
            from: buyerJettonWalletAddress,
            to: buyer.address,
            success: true,
        });
    });

    it('should throw error when withdraw wrong lp to to pool', async () => {
        // Need to add liquidity first
        const sendTonAmount = toNano('1000');
        const sendJettonAmount = 1000000n * 10n ** 9n;

        await provideJettonLiquidity(buyer, dexRouter, jettonMasterBondV1, null, 999n, sendTonAmount, sendJettonAmount);

        const lpAmount = 1n * 10n ** 9n;
        const asset0MinAmount = 0n;
        const asset1MinAmount = 0n;

        // get buyer's Jetton wallet balance before
        let buyerJettonWalletAddress = await jettonMasterBondV1.getWalletAddress(buyer.address);

        const message = PoolV1.packJettonTransfer({
            $$type: 'JettonTransfer',
            queryId: 0n,
            jettonAmount: lpAmount,
            to: poolV1.address,
            responseAddress: buyer.address,
            customPayload: null,
            forwardTonAmount: toNano('1'),
            forwardPayload: {
                $$type: 'WithdrawFP',
                asset0MinAmount: asset0MinAmount,
                asset1MinAmount: asset1MinAmount,
                recipient: buyer.address,
                fulfillPayload: null,
                rejectPayload: null,
            },
        });

        const result = await buyer.send({
            to: buyerJettonWalletAddress,
            value: toNano('1') * 2n,
            bounce: true,
            body: message,
            sendMode: 1,
        });

        // Expect throw invalid sender error 2022
        let poolJetttonWalletAddress = await jettonMasterBondV1.getWalletAddress(poolV1.address);
        expect(result.transactions).toHaveTransaction({
            from: poolJetttonWalletAddress,
            to: poolV1.address,
            success: false,
            exitCode: 2022,
        });
    });

    it('should send lp back to sender when min asset out did not meet', async () => {
        // Need to add liquidity first
        const sendTonAmount = toNano('1000');
        const sendJettonAmount = 1000000n * 10n ** 9n;

        await provideJettonLiquidity(buyer, dexRouter, jettonMasterBondV1, null, 999n, sendTonAmount, sendJettonAmount);

        const lpAmount = 1n * 10n ** 9n;
        const asset0MinAmount = toNano('1000000');
        const asset1MinAmount = toNano('1000000');

        // get buyer's LP wallet balance before
        let buyerLpWalletAddress = await poolV1.getWalletAddress(buyer.address);
        let poolLpWalletAddress = await poolV1.getWalletAddress(poolV1.address);
        let buyerLpWallet = blockchain.openContract(JettonWallet.createFromAddress(buyerLpWalletAddress));
        let buyerLpWalletBalanceBefore = await buyerLpWallet.getJettonBalance();

        // get buyer's Ton balance before
        let buyerTonBalanceBefore = await buyer.getBalance();

        // get buyer's Jetton wallet balance before
        let buyerJettonWalletAddress = await jettonMasterBondV1.getWalletAddress(buyer.address);
        let dexRouterWalletAddress = await jettonMasterBondV1.getWalletAddress(dexRouter.address);
        let buyerJettonWallet = blockchain.openContract(JettonWallet.createFromAddress(buyerJettonWalletAddress));
        let buyerJettonWalletBalanceBefore = await buyerJettonWallet.getJettonBalance();

        // get pool data before
        let poolDataBefore = await poolV1.getPoolData();

        const result = await withdraw(buyer, poolV1, lpAmount, asset0MinAmount, asset1MinAmount);

        // Expect that pool send transfer to pool's lp wallet
        expect(result.transactions).toHaveTransaction({
            op: PoolOpcodes.Transfer,
            from: poolV1.address,
            to: poolLpWalletAddress,
            success: true,
        });

        // Expect that pool lp wallet send internal transfer to buyer lp wallet
        expect(result.transactions).toHaveTransaction({
            op: PoolOpcodes.InternalTransfer,
            from: poolLpWalletAddress,
            to: buyerLpWalletAddress,
            success: true,
        });

        // Expect that buyer lp wallet balance is still the same
        let buyerLpWalletBalanceAfter = await buyerLpWallet.getJettonBalance();
        expect(buyerLpWalletBalanceAfter).toEqual(buyerLpWalletBalanceBefore);
    });
});
