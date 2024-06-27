import exp from 'constants';

const TON = 1_000_000_000n;
const PRICE_PRECISION = 1_000_000_000n;
const JETTON_DECIMAL = 1_000_000_000n;

class JettonMaster {
    ton_the_moon: bigint;
    on_moon: boolean;
    total_supply: bigint;
    admin_address: string;
    ton_reserves: bigint;
    jetton_reserves: bigint;
    fee: bigint;
    dex_router: string;
    jetton_wallet_code: any; // ignore
    jetton_content: any; // ignore
    v_ton: bigint;
    precision: bigint;
    fee_rate: bigint;
    commission: bigint;
    airdrop_rate: bigint;
    farm_rate: bigint;

    constructor(
        ton_the_moon: bigint,
        v_ton: bigint,
        total_supply: bigint,
        precision: bigint,
        fee_rate: bigint,
        commission: bigint = 100n,
        airdrop_rate: bigint = 10n,
        farm_rate: bigint = 10n,
        admin_address: string = 'address: 0xton',
        dex_router: string = 'address: dex router',
    ) {
        this.ton_the_moon = ton_the_moon;
        this.on_moon = false;
        this.total_supply = total_supply;
        this.admin_address = admin_address;
        this.ton_reserves = 0n;
        this.jetton_reserves = total_supply;
        this.fee = 0n;
        this.dex_router = dex_router;
        this.jetton_wallet_code = null; // ignore
        this.jetton_content = null; // ignore
        this.v_ton = v_ton;
        this.precision = precision;
        this.fee_rate = fee_rate;
        this.commission = commission;
        this.airdrop_rate = airdrop_rate;
        this.farm_rate = farm_rate;
    }

    get token_price() {
        return Number(this.ton_reserves + this.v_ton) / Number(this.jetton_reserves);
    }

    estimate_mint_jetton_amount(amount_in: bigint): [bigint, bigint, bigint] {
        const k = this.v_ton * this.total_supply;
        const amount_in_after_fees = (amount_in * (this.precision - this.fee_rate)) / this.precision;
        const true_amount_in =
            amount_in_after_fees < this.ton_the_moon - this.ton_reserves
                ? amount_in_after_fees
                : this.ton_the_moon - this.ton_reserves;
        const ton_has_to_pay = (true_amount_in * this.precision) / (this.precision - this.fee_rate);

        const x = this.ton_reserves + this.v_ton;
        const amount_out = this.jetton_reserves - k / (x + true_amount_in);

        return [amount_out, true_amount_in, ton_has_to_pay];
    }

    mint(amount_in: bigint) {
        if (this.on_moon) throw new Error('Token already listed');
        if (amount_in <= 0n) throw new Error('Invalid TON amount');
        const k = this.v_ton * this.total_supply;

        const [amount_out, true_amount_in, ton_has_to_pay] = this.estimate_mint_jetton_amount(amount_in);
        if (amount_in < ton_has_to_pay)
            throw new Error(
                `Not enough TON to mint, expect ${ton_has_to_pay / TON} TON, but got ${amount_in / TON} TON`,
            );

        if (this.ton_reserves + true_amount_in < this.ton_the_moon) {
            const remain_ton = amount_in - ton_has_to_pay;
            this.ton_reserves += true_amount_in;
            this.jetton_reserves -= amount_out;
            this.fee += ton_has_to_pay - true_amount_in;
            return [remain_ton, 0n];
        } else {
            this.on_moon = true;
            const expect_ton = this.ton_the_moon - this.ton_reserves;
            const revised_jetton_amount = this.jetton_reserves - k / (this.ton_reserves + this.v_ton + expect_ton);
            const remain_ton = amount_in - (expect_ton * (this.precision + this.fee_rate)) / this.precision;
            this.ton_reserves += expect_ton;
            this.jetton_reserves -= revised_jetton_amount;
            this.fee += ton_has_to_pay - true_amount_in;
            return [remain_ton, amount_out - revised_jetton_amount];
        }
    }

    burn(jetton_amount: bigint) {
        if (this.on_moon) throw new Error('Token already listed');
        if (jetton_amount <= 0n) throw new Error('Invalid jetton amount');

        const k = this.v_ton * this.total_supply;
        let delta_ton = this.ton_reserves + this.v_ton - k / (this.jetton_reserves + jetton_amount);
        let fee = (delta_ton * this.fee_rate) / this.precision;
        let remain_ton = delta_ton - fee;

        this.ton_reserves -= delta_ton;
        this.jetton_reserves += jetton_amount;
        this.fee += fee;

        return remain_ton;
    }

    calculateLiquidityAndFees() {
        const send_ton_liquidity = (this.ton_reserves * (this.precision - this.commission)) / this.precision;
        const ton_fee_for_admin = this.ton_reserves - send_ton_liquidity + this.fee;

        const price_for_now = (PRICE_PRECISION * (this.ton_reserves + this.v_ton)) / this.jetton_reserves;
        const send_jetton_liquidity = (PRICE_PRECISION * send_ton_liquidity) / price_for_now;
        const jetton_fee_for_admin = (this.total_supply * (this.airdrop_rate + this.farm_rate)) / this.precision;
        const true_jetton_fee_for_admin = this.jetton_reserves - send_jetton_liquidity;
        this.total_supply -= (true_jetton_fee_for_admin - jetton_fee_for_admin);

        return {
            send_ton_liquidity,
            ton_fee_for_admin,
            send_jetton_liquidity,
            jetton_fee_for_admin,
            true_jetton_fee_for_admin,
        };
    }

    stats() {
        const progress = Number((this.ton_reserves * this.ton_the_moon) / this.ton_the_moon) / 100;
        const init_price = Number(this.v_ton) / Number(this.total_supply);
        // console.log('> is on moon:', this.on_moon);
        // console.log('> progress', `${progress.toFixed(2)}%`);
        // console.log('> ton reserves:', this.ton_reserves);
        // console.log('> jetton reserves:', this.jetton_reserves);
        // console.log('> token price:', this.token_price, '(TON/JETTON)');
        // console.log('> price increase:', `${Number((this.token_price / init_price) * 100) - 100}% 📈`);
        // console.log('> fdv:', (this.token_price * Number(this.total_supply)) / Number(TON), '(TON)');
        // console.log('> protocol fee:', this.fee);
        return {
            on_moon: this.on_moon,
            ton_reserve: this.ton_reserves,
            jetton_reserve: this.jetton_reserves,
            protocol_fee: this.fee,
            token_price: this.token_price,
            total_supply: this.total_supply,
            v_ton: this.v_ton,
        };
    }
}
export default JettonMaster;
