const assert = require('assert');
const {
  recognizePayments,
  sumRecognizedPayments
} = require('../utils/financeRevenueRecognition');

const orders = [
  { _id: 'order-open', status: 'partial' },
  { _id: 'order-void', status: 'void' }
];

const FeeOrderModel = {
  find({ _id: { $in: ids = [] } } = {}) {
    const rows = orders.filter((item) => ids.includes(item._id));
    return {
      select() { return this; },
      async lean() { return rows; }
    };
  }
};

async function run() {
  const payments = [
    {
      _id: 'payment-mixed',
      amount: 1000,
      allocations: [
        { feeOrderId: 'order-open', feeType: 'tuition', amount: 600 },
        { feeOrderId: 'order-void', feeType: 'admission', amount: 400 }
      ]
    },
    {
      _id: 'payment-void',
      amount: 500,
      feeOrderId: 'order-void'
    },
    {
      _id: 'payment-legacy-unlinked',
      amount: 200
    }
  ];

  const rows = await recognizePayments(payments, { FeeOrderModel });
  assert.deepStrictEqual(
    rows.map(({ recognizedAmount, excludedVoidAmount }) => ({ recognizedAmount, excludedVoidAmount })),
    [
      { recognizedAmount: 600, excludedVoidAmount: 400 },
      { recognizedAmount: 0, excludedVoidAmount: 500 },
      { recognizedAmount: 200, excludedVoidAmount: 0 }
    ]
  );
  assert.strictEqual(await sumRecognizedPayments(payments, { FeeOrderModel }), 800);
  assert.deepStrictEqual(rows[0].recognizedAllocations, [
    { feeOrderId: 'order-open', feeType: 'tuition', amount: 600 }
  ]);
  console.log('check:finance-revenue-recognition PASS');
}

run().catch((error) => {
  console.error('check:finance-revenue-recognition FAIL');
  console.error(error);
  process.exitCode = 1;
});
