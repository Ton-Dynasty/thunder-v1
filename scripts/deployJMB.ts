import { Address, Cell, beginCell, toNano } from '@ton/core';
import { JettonMasterBondV1 } from '../wrappers/JettonMasterBondV1';
import { compile, NetworkProvider } from '@ton/blueprint';
import { JettonWallet } from '@ton/ton';
import { buildJettonContent } from '../utils/jetton';
import { promptBool, promptToncoin } from '../utils/ui';

export async function run(provider: NetworkProvider) {
    // compile contracts
    const jettonMasterBondV1Code = await compile(JettonMasterBondV1.name);
    const jettonWalletCode = await compile(JettonWallet.name);

    // configurable constants
    const fee = 10n; // 1%
    const decimals = '9';
    const totalSupply = toNano('100000000');

    // prompt user for jetton details
    const name = await provider.ui().input('Please enter the name of the jetton:'); // prettier-ignore
    const symbol = await provider.ui().input('Please enter the symbol of the jetton:'); // prettier-ignore
    const description = await provider.ui().input('Please enter the description of the jetton:'); // prettier-ignore
    const image = await provider.ui().input('Please enter the image url of the jetton:'); // prettier-ignore
    const jettonContent = buildJettonContent({
        symbol: symbol,
        name: name,
        description: description,
        image: image,
        decimals: decimals,
    });
    const premintOrNot = await promptBool('Do you want to pre-mint tokens? : ', ['y', 'n'], provider.ui());
    let tonAmount = 0n;
    if (premintOrNot) {
        tonAmount = await promptToncoin('Enter the amount of TON to buy MEME: ', provider.ui());
    }
    let minTokenOut = 0n;

    const jettonMasterBondV1 = provider.open(
        JettonMasterBondV1.createFromConfig(
            {
                totalSupply: totalSupply,
                adminAddress: Address.parse('0QCg05dcxHO09Ydrw-yTuexzMUa8iJmYAO4eWmyqfgVnDZ_0'),
                tonReserves: 0n,
                jettonReserves: totalSupply,
                fee: fee,
                onMoon: false,
                jettonWalletCode: jettonWalletCode,
                jettonContent: jettonContent,
                vTon: toNano('1000'),
                tonTheMoon: toNano('1500'),
                feeRate: 10n,
            },
            jettonMasterBondV1Code,
        ),
    );
    console.log('Jetton Master Bond Address: ', jettonMasterBondV1.address);

    let sendAllTon = tonAmount + toNano('1');
    await jettonMasterBondV1.sendMint(
        provider.sender(),
        { value: sendAllTon },
        {
            $$type: 'BuyToken',
            queryId: 0n,
            tonAmount: tonAmount,
            minTokenOut: minTokenOut,
            destination: provider.sender().address!,
            responseAddress: provider.sender().address!,
            custom_payload: null,
            forwardTonAmount: 0n,
            forwardPayload: beginCell().storeUint(0n, 1).endCell(),
        },
    );

    await provider.waitForDeploy(jettonMasterBondV1.address);

    // run methods on `jettonMasterBondV1`
}
