import { Address, toNano } from '@ton/core';
import { JettonMasterBondV1 } from '../wrappers/JettonMasterBondV1';
import { compile, NetworkProvider } from '@ton/blueprint';
import { JettonWallet } from '@ton/ton';
import { buildJettonContent } from '../utils/jetton';

export async function run(provider: NetworkProvider) {
    // compile contracts
    const jettonMasterBondV1Code = await compile(JettonMasterBondV1.name);
    const jettonWalletCode = await compile(JettonWallet.name);

    // configurable constants
    const fee = 10n; // 1%
    const decimals = '9';
    const totalSupply = toNano('100000000');
    const dexRouterAddress = Address.parse('EQC1VChhiuVJUhiWyFCGXS86me0sn4E6bEnKlQ8rH5TiVM9s');

    // prompt user for jetton details
    const name = await provider.ui().input('Please enter the name of the jetton:'); // prettier-ignore
    const symbol = await provider.ui().input('Please enter the symbol of the jetton:'); // prettier-ignore
    const description =  await provider.ui().input('Please enter the description of the jetton:'); // prettier-ignore
    const image = await provider.ui().input('Please enter the image url of the jetton:'); // prettier-ignore
    const jettonContent = buildJettonContent({
        symbol: symbol,
        name: name,
        description: description,
        image: image,
        decimals: decimals,
    });

    const jettonMasterBondV1 = provider.open(
        JettonMasterBondV1.createFromConfig(
            {
                totalSupply: totalSupply,
                adminAddress: provider.sender().address!,
                tonReserves: 0n,
                jettonReserves: totalSupply,
                fee: fee,
                onMoon: 0n,
                dexRouter: dexRouterAddress,
                jettonWalletCode: jettonWalletCode,
                jettonContent: jettonContent,
            },
            jettonMasterBondV1Code,
        ),
    );

    await jettonMasterBondV1.sendDeploy(provider.sender(), toNano('0.05'));

    await provider.waitForDeploy(jettonMasterBondV1.address);

    // run methods on `jettonMasterBondV1`
}
