import { Blockchain, SandboxContract, TreasuryContract, printTransactionFees } from '@ton/sandbox';
import { Address, Cell, beginCell, toNano } from '@ton/core';
import { JettonMasterBondV1, MasterOpocde } from '../wrappers/JettonMasterBondV1';
import { DexRouter } from '../wrappers/DexRouter';
import '@ton/test-utils';
import { compile } from '@ton/blueprint';
import { JettonWallet } from '../wrappers/JettonWallet';
import { loadFixture } from './helper';

describe('JettonMasterBondV1', () => {
    let blockchain: Blockchain;
    let deployer: SandboxContract<TreasuryContract>;
    let dexRouter: SandboxContract<DexRouter>;
    let jettonMasterBondV1: SandboxContract<JettonMasterBondV1>;
    const precision = 1000n;
    const fee_rate = 10n;

    const buyToken = async (
        buyer: SandboxContract<TreasuryContract>,
        tonAmount: bigint = toNano('10'),
        mint_token_out: bigint = 0n,
        destination: Address = buyer.address,
        response_address: Address = buyer.address,
        custom_payload: Cell | null = null,
        forward_ton_amount: bigint = 0n,
        forward_payload: Cell = beginCell().storeUint(0n, 1).endCell(),
    ) => {
        let sendAllTon = tonAmount + toNano('1');
        return await jettonMasterBondV1.sendBuyToken(
            buyer.getSender(),
            { value: sendAllTon },
            {
                $$type: 'BuyToken',
                query_id: 0n,
                ton_amount: tonAmount,
                mint_token_out: mint_token_out,
                destination: destination,
                response_address: response_address,
                custom_payload: custom_payload,
                forward_ton_amount: forward_ton_amount,
                forward_payload: forward_payload,
            },
        );
    };

    beforeEach(async () => {
        ({ blockchain, deployer, dexRouter, jettonMasterBondV1 } = await loadFixture());
    });

    const userWallet = async (address: Address, jettonMaster: SandboxContract<JettonMasterBondV1>) =>
        blockchain.openContract(JettonWallet.createFromAddress(await jettonMaster.getWalletAddress(address)));

    it('should deploy', async () => {
        // the check is done inside beforeEach
        // blockchain and jettonMasterBondV1 are ready to use
    });

    it('should buy token with 10 tons', async () => {
        let [tonReservesBefore, jettonReservesBefore] = await jettonMasterBondV1.getReserves();

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
                mint_token_out: 0n,
                destination: buyer.address,
                response_address: buyer.address,
                custom_payload: null,
                forward_ton_amount: 0n,
                forward_payload: beginCell().storeUint(0n, 1).endCell(),
            },
        );
        let buyerTonBalanceAfter = await buyer.getBalance();

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

        let [tonReservesAfter, jettonReservesAfter] = await jettonMasterBondV1.getReserves();

        // Expect that ton reserves is equal to 9900000000n
        expect(tonReservesAfter).toEqual(9900000000n);

        // Expect that jetton reserve is equal to 99019704921279334n
        expect(jettonReservesAfter).toEqual(99019704921279334n);

        // Expect that buyer received meme token
        expect(buyerMemeTokenBalance).toBe(jettonReservesBefore - jettonReservesAfter);

        // Expect buyer meme token balance is equal to 980295078720666n
        expect(buyerMemeTokenBalance).toBe(980295078720666n);

        // Expect that ton reserves increased tonAmount * 90%
        expect(tonReservesAfter - tonReservesBefore).toEqual((tonAmount * (precision - fee_rate)) / precision);

        let feeAfter = await jettonMasterBondV1.getFees();
        // Expect that fees increased tonAmount * 10%
        expect(feeAfter).toEqual((tonAmount * fee_rate) / precision);
    });

    it('should burn half of buyers meme tokens', async () => {
        const buyer = await blockchain.treasury('buyer', { workchain: 0, balance: toNano('1000000') });
        await buyToken(buyer);

        let buyerWallet = await userWallet(buyer.address, jettonMasterBondV1);
        let buyerMemeTokenBalanceBefore = await buyerWallet.getJettonBalance();

        // Buyers burn half of meme tokens
        let buyerTonBalanceBefore = await buyer.getBalance();
        let burnAmount = buyerMemeTokenBalanceBefore / 2n;
        const burnResult = await buyerWallet.sendBurn(buyer.getSender(), toNano('1'), burnAmount, null, null);
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

        let [tonReservesAfter, jettonReservesAfter] = await jettonMasterBondV1.getReserves();

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
        const toTheMoonResult = await buyToken(buyer, toNano('1000000'));
        // printTransactionFees(toTheMoonResult.transactions);

        // Expect that jettonMasterBondV1 send internal transfer to DexRouter wallet
        let dexRouterWalletAddress = await jettonMasterBondV1.getWalletAddress(dexRouter.address);
        expect(toTheMoonResult.transactions).toHaveTransaction({
            op: MasterOpocde.InternalTransfer,
            from: jettonMasterBondV1.address,
            to: dexRouterWalletAddress,
            success: true,
        });
    });
});
