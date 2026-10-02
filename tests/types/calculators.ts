// Compile only. Runtime validation and rounding have separate Node tests.
import * as calculate from '../../assets/business-calculators.mjs';
import { calculatorTools } from '../../assets/webmcp-tools.mjs';

const result = calculate.gst('110.00', true);
const tax: number = result.gst;
// @ts-expect-error Money inputs are decimal strings, not numeric dollars or cents.
calculate.gst(110);
// @ts-expect-error GST inclusion is a boolean flag.
calculate.gst('110.00', 'inclusive');
// @ts-expect-error Variance needs the declared income or cost interpretation.
calculate.variance('100', '90', 'expense');
// @ts-expect-error A calculated amount is numeric, not formatted text.
const formatted: string = result.gst;
const weeks = [{ receipts: '100', payments: '20' }];
calculate.cashForecast('0', weeks, '50', { week: '1', amount: '10', delay: 2 });
// @ts-expect-error Each week needs both receipts and payments.
calculate.cashForecast('0', [{ receipts: '100' }], '50');
// @ts-expect-error A cash deferral amount uses the same decimal string contract.
calculate.cashForecast('0', weeks, '50', { week: 1, amount: 10, delay: 2 });

const tool = calculatorTools(calculate).gst;
tool.execute({ amount: '110.00', inclusive: true });
// @ts-expect-error The WebMCP descriptor needs the calculator's numeric result contract.
calculatorTools({ gst: () => ({ net: '100', gst: '10', gross: '110' }) });
void tax;
void formatted;
