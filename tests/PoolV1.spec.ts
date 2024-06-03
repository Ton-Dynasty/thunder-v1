import { Blockchain, printTransactionFees, SandboxContract, TreasuryContract } from '@ton/sandbox';
import { Address, beginCell, Cell, storeStateInit, toNano, Transaction } from '@ton/core';
import { PoolV1, PoolOpcodes } from '../wrappers/PoolV1';
import { JettonWallet } from '../wrappers/JettonWallet';
import '@ton/test-utils';
import { compile } from '@ton/blueprint';
import { loadJMBondFixture, buyToken } from './helper';
import { DexRouter } from '../wrappers/DexRouter';
import { JettonMasterBondV1 } from '../wrappers/JettonMasterBondV1';
import { Op } from '../wrappers/JettonConstants';
import { collectCellStats, computedGeneric } from '../gasUtils';
import { findTransactionRequired } from '@ton/test-utils';

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
                minLpAmount: minLPAmount,
                ton_amount: sendTonAmount,
                master_address: jettonMaster.address,
                recipient: recipient,
                fulfill_payload: null,
                reject_payload: null,
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
        let poolAddress = await dexRouter.getPoolAddress(jettonMasterBondV1.address);
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

        // Expect that buyer LP wallet balance increased
        let buyerLpWalletBalanceAfter = await buyerLpWallet.getJettonBalance();
        expect(buyerLpWalletBalanceAfter).toBeGreaterThan(buyerLpWalletBalanceBefore);

        // Expect that buyer Jetton wallet balance decreased
        let buyerJettonWalletBalanceAfter = await buyerJettonWallet.getJettonBalance();
        expect(buyerJettonWalletBalanceAfter + sendJettonAmount).toEqual(buyerJettonWalletBalanceBefore);
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
                minLpAmount: minLPAmount,
                ton_amount: addLiquidityAmount,
                master_address: jettonMasterBondV1.address,
                recipient: recipient,
                fulfill_payload: null,
                reject_payload: null,
            },
        });

        const sendNotEnoughResult = await buyer.send({
            to: buyerJettonWalletAddress,
            value: sendTonAmount + gas_fee * 2n,
            bounce: true,
            body: message,
            sendMode: 1,
        });
        printTransactionFees(sendNotEnoughResult.transactions);

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
});
