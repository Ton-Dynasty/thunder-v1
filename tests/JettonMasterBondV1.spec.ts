import { Blockchain, SandboxContract, TreasuryContract, printTransactionFees } from '@ton/sandbox';
import { Address, Cell, Transaction, beginCell, storeStateInit, toNano } from '@ton/core';
import { JettonMasterBondV1, MasterOpocde } from '../wrappers/JettonMasterBondV1';
import { DexRouter } from '../wrappers/DexRouter';
import '@ton/test-utils';
import { compile } from '@ton/blueprint';
import { JettonWallet } from '../wrappers/JettonWallet';
import { loadJMBondFixture, buyToken } from './helper';
import { collectCellStats, computedGeneric } from '../gasUtils';
import { findTransactionRequired } from '@ton/test-utils';

describe('JettonMasterBondV1', () => {
    let blockchain: Blockchain;
    let deployer: SandboxContract<TreasuryContract>;
    let dexRouter: SandboxContract<DexRouter>;
    let jettonMasterBondV1: SandboxContract<JettonMasterBondV1>;
    let printTxGasStats: (name: string, trans: Transaction) => bigint;
    const precision = 1000n;
    const fee_rate = 10n;

    const getMasterData = async (jettonMasterBondV1: SandboxContract<JettonMasterBondV1>, field: string = '') => {
        const [tonReserves, jettonReserves, fee, totalSupply, onMoon, dexRouter, adminAddress] =
            await jettonMasterBondV1.getMasterData();

        switch (field) {
            case 'tonReserves':
                return tonReserves;
            case 'jettonReserves':
                return jettonReserves;
            case 'fee':
                return fee;
            case 'totalSupply':
                return totalSupply;
            case 'onMoon':
                return onMoon;
            case 'dexRouter':
                return dexRouter;
            case 'adminAddress':
                return adminAddress;
            default:
                return {
                    tonReserves,
                    jettonReserves,
                    fee,
                    totalSupply,
                    onMoon,
                    dexRouter,
                    adminAddress,
                };
        }
    };

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
        let tonReservesBefore = BigInt((await getMasterData(jettonMasterBondV1, 'tonReserves')).toString());
        let jettonReservesBefore = BigInt((await getMasterData(jettonMasterBondV1, 'jettonReserves')).toString());

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

        let tonReservesAfter = BigInt((await getMasterData(jettonMasterBondV1, 'tonReserves')).toString());
        let jettonReservesAfter = BigInt((await getMasterData(jettonMasterBondV1, 'jettonReserves')).toString());

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

        let feeAfter = await getMasterData(jettonMasterBondV1, 'fee');
        // Expect that fees increased tonAmount * 10%
        expect(feeAfter).toEqual((tonAmount * fee_rate) / precision);
    });

    it('should burn half of buyers meme tokens', async () => {
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

        let tonReservesAfter = await getMasterData(jettonMasterBondV1, 'tonReserves');
        let jettonReservesAfter = await getMasterData(jettonMasterBondV1, 'jettonReserves');

        // Expect ton reserves = 4925618189n
        expect(tonReservesAfter).toEqual(4925618189n);

        // Expect jetton reserves = 99509852460639667n
        expect(jettonReservesAfter).toEqual(99509852460639667n);

        // Expect that buyers ton balance increased at least 4924637993n
        let gas_fee = toNano('0.05');
        expect(buyerTonBalanceAfter - buyerTonBalanceBefore + gas_fee).toBeGreaterThanOrEqual(4924637993n);
    });

    it('should trnasfer tokens and tons to DexRouter after meeting TonTheMoon', async () => {
        const buyer = await blockchain.treasury('buyer', { workchain: 0, balance: toNano('10000000') });
        const buyTon = toNano('1000000');
        const toTheMoonResult = await buyToken(jettonMasterBondV1, buyer, buyTon);

        // Expect that jettonMasterBondV1 send internal transfer to DexRouter wallet
        let dexRouterWalletAddress = await jettonMasterBondV1.getWalletAddress(dexRouter.address);
        expect(toTheMoonResult.transactions).toHaveTransaction({
            op: MasterOpocde.InternalTransfer,
            from: jettonMasterBondV1.address,
            to: dexRouterWalletAddress,
            success: true,
        });

        // const sendToDexRouterTx = findTransactionRequired(toTheMoonResult.transactions, {
        //     op: MasterOpocde.InternalTransfer,
        //     from: jettonMasterBondV1.address,
        //     to: dexRouterWalletAddress,
        //     success: true,
        // });
        // printTxGasStats('JM Send to Dex Router', sendToDexRouterTx);

        // Expect that dexRouterWallet send jetton notification to dexRouter
        expect(toTheMoonResult.transactions).toHaveTransaction({
            op: MasterOpocde.JettonNotification,
            from: dexRouterWalletAddress,
            to: dexRouter.address,
            success: true,
            //value: 9001000000000n, // 9000 ton + 1 ton for build pool and farm
        });

        // const deployPoolTx = findTransactionRequired(toTheMoonResult.transactions, {
        //     op: MasterOpocde.JettonNotification,
        //     from: dexRouterWalletAddress,
        //     to: dexRouter.address,
        //     success: true,
        // });
        // printTxGasStats('Dex Router Deploy Pool:', deployPoolTx);

        // Expect that dexRouterWallet send excess to admin address
        expect(toTheMoonResult.transactions).toHaveTransaction({
            op: MasterOpocde.Excess,
            from: dexRouterWalletAddress,
            to: deployer.address,
            success: true,
            //value: 999034037987n, // admin fees
        });

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

        // const burnMeMeTx = findTransactionRequired(toTheMoonResult.transactions, {
        //     op: MasterOpocde.Excess,
        //     from: buyerWallet.address,
        //     to: buyer.address,
        //     success: true,
        // });
        // printTxGasStats('Send TON Fee', burnMeMeTx);

        // buyers meme token balance should be 90909090909090910n
        let buyerMemeTokenBalance = await buyerWallet.getJettonBalance();
        expect(buyerMemeTokenBalance).toEqual(90909090909090910n);

        // Dex Ruoter meme token balance should be 7438016528925619
        let dexRouterWallet = await userWallet(dexRouter.address, jettonMasterBondV1);
        let dexRouterMemeTokenBalance = await dexRouterWallet.getJettonBalance();
        expect(dexRouterMemeTokenBalance).toEqual(7438016528925619n);

        // Expect jettonMasterBondV1 ton reserves = 0
        let tonReservesAfter = await getMasterData(jettonMasterBondV1, 'tonReserves');
        let jettonReservesAfter = await getMasterData(jettonMasterBondV1, 'jettonReserves');
        expect(tonReservesAfter).toEqual(0n);

        // Expect jettonMasterBondV1 jetton reserves = 0
        expect(jettonReservesAfter).toEqual(0n);

        // Expect fee = 0
        let feeAfter = await getMasterData(jettonMasterBondV1, 'fee');
        expect(feeAfter).toEqual(0n);

        // Epext that onMoon = 1n
        let onMoon = await getMasterData(jettonMasterBondV1, 'onMoon');
        expect(onMoon).toEqual(1n);

        let poolAddress = await dexRouter.getPoolAddress(jettonMasterBondV1.address);
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

    it('should buy meme tokens and sell meme tokens 100 times', async () => {
        let buyer = await blockchain.treasury('buyer', { workchain: 0, balance: toNano('1000000') });
        const buyTon = toNano('10');
        let buyerWallet = await userWallet(buyer.address, jettonMasterBondV1);

        // use for loop to buy and sell meme tokens 100 times
        for (let i = 0; i < 100; i++) {
            await buyToken(jettonMasterBondV1, buyer, buyTon);
            let burnAmount = await buyerWallet.getJettonBalance();
            await buyerWallet.sendBurn(buyer.getSender(), toNano('1'), burnAmount, null, null);
        }

        // Expect that ton reserves = 0
        let tonReservesAfter = await getMasterData(jettonMasterBondV1, 'tonReserves');
        expect(tonReservesAfter).toEqual(0n);

        // Expect that jetton reserves = 100000000000000000n
        let jettonReservesAfter = await getMasterData(jettonMasterBondV1, 'jettonReserves');
        expect(jettonReservesAfter).toEqual(100000000000000000n);

        // Expect that fee = 19900000000n
        let feeAfter = await getMasterData(jettonMasterBondV1, 'fee');
        expect(feeAfter).toEqual(19900000000n);
    });
});
