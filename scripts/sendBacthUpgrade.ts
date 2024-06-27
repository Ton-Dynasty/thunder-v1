import { NetworkProvider, compile } from '@ton/blueprint';
import { Address, Cell, OutActionSendMsg, SendMode, beginCell, toNano, internal as internal_relaxed } from '@ton/core';
import { JettonMasterBondV1 } from '../wrappers/JettonMasterBondV1';
import { mnemonicToWalletKey } from '@ton/crypto';
import { HighloadWalletV3 } from '../wrappers/HighloadWalletV3';
import { DEFAULT_TIMEOUT, SUBWALLET_ID } from '../wrappers/const';
import { HighloadQueryId } from '../wrappers/HighloadQueryId';

function sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function run(provider: NetworkProvider) {
    const updateTargetMasterAddresses = ['EQCO1aU3btp0RzlkPqdpBg0oM-y7-YKYtsHL7kZMF5Nsn3uh'];
    console.log(`updateTargetMasterAddresses Length: ${updateTargetMasterAddresses.length}`);

    const newCode = await compile(JettonMasterBondV1.name);
    const updateDataList = [];

    // Fetch data for each address
    for (const address of updateTargetMasterAddresses) {
        console.log(`Fetching data for ${address} \n`);
        let jettonMasterAddress = Address.parse(address);
        const jettonMasterBondV1 = provider.open(JettonMasterBondV1.createFromAddress(jettonMasterAddress));
        const masterData = await jettonMasterBondV1.getMasterData();
        await sleep(1500);
        const jettonData = await jettonMasterBondV1.getJettonData();

        const tonReserves: bigint = masterData.tonReserves;
        const jettonReserves: bigint = masterData.jettonReserves;
        const fee: bigint = masterData.fee;
        const totalSupply: bigint = masterData.totalSupply;
        const onMoon: boolean = masterData.onMoon;
        const adminAddress: Address | null = masterData.adminAddress;
        const jettonWalletCode: Cell = jettonData.walletCode;
        const jettonContent: Cell = jettonData.content;

        const basicInfo = beginCell().storeBit(onMoon).storeRef(jettonWalletCode).storeRef(jettonContent).endCell();
        const vTon = masterData.vTon;
        const tonTheMoon = masterData.tonTheMoon;
        const feeRate = masterData.feeRate;
        const parmsInfo = beginCell().storeCoins(vTon).storeCoins(tonTheMoon).storeUint(feeRate, 16).endCell();

        const newData: Cell = beginCell()
            .storeCoins(totalSupply)
            .storeAddress(adminAddress)
            .storeCoins(tonReserves)
            .storeCoins(jettonReserves)
            .storeCoins(fee)
            .storeRef(basicInfo)
            .storeRef(parmsInfo)
            .endCell();

        updateDataList.push({ jettonMasterAddress, newData });
        await sleep(1500);
    }

    // Batch send upgrade transactions
    let outMsgs: OutActionSendMsg[] = new Array(254);
    for (let i = 0; i < updateTargetMasterAddresses.length; i++) {
        const msgBody = JettonMasterBondV1.packUpgrade({
            $$type: 'Upgrade',
            queryId: BigInt(i),
            newCode: newCode,
            newData: updateDataList[i].newData,
        });
        outMsgs[i] = {
            type: 'sendMsg',
            mode: SendMode.NONE,
            outMsg: internal_relaxed({
                to: updateDataList[i].jettonMasterAddress,
                value: toNano('0.03'),
                body: msgBody,
            }),
        };
    }
    const mnemonic = process.env.WALLET_MNEMONIC!.split(' ');
    const keyPair = await mnemonicToWalletKey(mnemonic);
    const curQuery = new HighloadQueryId();

    const highloadWalletV3Address = Address.parse('UQBfNwq3m9wWwWFVlSf5U0n2mcCiIWcp1TB7ySacMdyQesKM'); //await promptAddress('Enter your highload-wallet-v3 address: ', provider.ui());
    const highloadWalletV3 = provider.open(HighloadWalletV3.createFromAddress(highloadWalletV3Address));

    console.log('\nHighload-Wallet start to upgrade...\n');

    for (let i = 0; i < 100; i++) {
        try {
            console.log('Sending batch...', i);
            await highloadWalletV3.sendBatch(
                keyPair.secretKey,
                outMsgs,
                SUBWALLET_ID,
                curQuery,
                DEFAULT_TIMEOUT,
                Math.floor(Date.now() / 1000) - 10,
            );
            break;
        } catch (e) {
            console.log('Error: ', e);
            await sleep(5000);
        }
    }
}
