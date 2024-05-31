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

    beforeEach(async () => {
        ({ blockchain, deployer, dexRouter, jettonMasterBondV1 } = await loadFixture());
    });

    const userWallet = async (address: Address, jettonMaster: SandboxContract<JettonMasterBondV1>) =>
        blockchain.openContract(JettonWallet.createFromAddress(await jettonMaster.getWalletAddress(address)));

    it('should deploy', async () => {
        // the check is done inside beforeEach
        // blockchain and jettonMasterBondV1 are ready to use
    });

    it('should buy token with ton', async () => {
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

        // Expect that buyer received meme token
        expect(buyerMemeTokenBalance).toBe(jettonReservesBefore - jettonReservesAfter);

        // Expect buyer meme token balance is equal to 980295078720666n
        expect(buyerMemeTokenBalance).toBe(980295078720666n);

        // Expect that ton reserves increased tonAmount * 10%
        expect(tonReservesAfter - tonReservesBefore).toEqual((tonAmount * (precision - fee_rate)) / precision);


    });
});
