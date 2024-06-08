import { toNano } from '@ton/core';
import { compile, NetworkProvider, sleep } from '@ton/blueprint';
import { JettonWallet } from '@ton/ton';
import { Factory, MAINNET_FACTORY_ADDR } from '@dedust/sdk';
import { Address, TonClient4 } from '@ton/ton';
import { Asset, PoolType, ReadinessStatus } from '@dedust/sdk';
import { promptAddress } from '../utils/ui';

export async function run(provider: NetworkProvider) {
    const factory = provider.open(Factory.createFromAddress(MAINNET_FACTORY_ADDR));
    const jettonAddress = await promptAddress('Please enter the jetton address to create lp pool:', provider.ui()); // prettier-ignore

    // Create a vault
    await factory.sendCreateVault(provider.sender(), {
        asset: Asset.jetton(jettonAddress),
    });
    const jettonVault = provider.open(await factory.getJettonVault(jettonAddress));
    while ((await jettonVault.getReadinessStatus()) !== ReadinessStatus.READY) {
        sleep(1000);
    }
    console.log('Vault created:', `https://tonviewer.com/${jettonVault.address.toString()}`);

    // Create a volatile pool
    const TON = Asset.native();
    const Jetton = Asset.jetton(jettonAddress);
    const pool = provider.open(await factory.getPool(PoolType.VOLATILE, [TON, Jetton]));
    await factory.sendCreateVolatilePool(provider.sender(), {
        assets: [TON, Jetton],
    });
    while ((await pool.getReadinessStatus()) !== ReadinessStatus.READY) {
        sleep(1000);
    }
    console.log('Pool created:', `https://tonviewer.com/${pool.address.toString()}`);

    // print vault address and pool address
    const vaultAddress = await factory.getVaultAddress(Jetton);
    const poolAddress = await factory.getPoolAddress({ poolType: PoolType.VOLATILE, assets: [TON, Jetton] });

    console.log('Vault address:', vaultAddress.toString());
    console.log('Pool address:', poolAddress.toString());
}
