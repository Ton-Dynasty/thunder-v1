import { Blockchain, printTransactionFees, SandboxContract, TreasuryContract } from '@ton/sandbox';
import { Address, beginCell, Cell, storeStateInit, toNano } from '@ton/core';
import { PoolV1 } from '../wrappers/PoolV1';
import { JettonWallet } from '../wrappers/JettonWallet';
import '@ton/test-utils';
import { compile } from '@ton/blueprint';
import { loadJMBondFixture, buyToken } from './helper';
import { DexRouter } from '../wrappers/DexRouter';
import { JettonMasterBondV1 } from '../wrappers/JettonMasterBondV1';
import { Op } from '../wrappers/JettonConstants';
import { collectCellStats } from '../gasUtils';

describe('PoolV1', () => {
    let blockchain: Blockchain;
    let deployer: SandboxContract<TreasuryContract>;
    let buyer: SandboxContract<TreasuryContract>;
    let poolV1: SandboxContract<PoolV1>;
    let poolV1Code: Cell;
    let jettonWalletCode: Cell;
    let dexRouter: SandboxContract<DexRouter>;
    let jettonMasterBondV1: SandboxContract<JettonMasterBondV1>;

    const userWallet = async (address: Address, jettonMaster: SandboxContract<JettonMasterBondV1>) =>
        blockchain.openContract(JettonWallet.createFromAddress(await jettonMaster.getWalletAddress(address)));

    const provideJettonLiquidity = async (
        buyer: SandboxContract<TreasuryContract>,
        dexRouter: SandboxContract<DexRouter>,
        jettonMaster: SandboxContract<JettonMasterBondV1>,
        queryId: bigint = 0n,
        sendTonAmount: bigint = toNano('10'),
        sendJettonAmount: bigint = 10n * 10n ** 9n,
        forwardAmount: bigint = toNano('1'),
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
            value: sendTonAmount + forwardAmount + toNano('1'),
            bounce: true,
            body: message,
            sendMode: 1,
        });
    };

    beforeAll(async () => {
        poolV1Code = await compile(PoolV1.name);
        jettonWalletCode = await compile(JettonWallet.name);
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
        let buyerLpWalletBalanceAfter = await buyerLpWallet.getJettonBalance();
        let buyerJettonWalletBalanceAfter = await buyerJettonWallet.getJettonBalance();

        expect(buyerLpWalletBalanceAfter).toBeGreaterThan(buyerLpWalletBalanceBefore);
        expect(buyerJettonWalletBalanceAfter + sendJettonAmount).toEqual(buyerJettonWalletBalanceBefore);

        expect(result.transactions).toHaveTransaction({
            from: dexRouter.address,
            to: poolV1.address,
            deploy: false,
            success: true,
        });
    });
});
