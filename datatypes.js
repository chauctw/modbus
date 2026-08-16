// Bảng mã kiểu dữ liệu (TAG_DATA_TYPE) theo quy ước KEPServerEX / Kepware
// (áp dụng chung cho hầu hết các driver, gồm cả Modbus TCP/IP Ethernet)
const DATA_TYPES = {
  0: 'Default',
  1: 'Boolean',
  2: 'Char',
  3: 'Byte',
  4: 'Word',
  5: 'Short',
  6: 'DWord',
  7: 'Long',
  8: 'Float',
  9: 'Double',
  10: 'String',
  11: 'BCD',
  12: 'LBCD',
  13: 'Date',
  14: 'LLong',
  15: 'QWord',
};

const DATA_TYPE_NAME_TO_CODE = Object.fromEntries(
  Object.entries(DATA_TYPES).map(([code, name]) => [name, Number(code)])
);

const RW_ACCESS = {
  0: 'Read Only',
  1: 'Read/Write',
};

// Prefix địa chỉ Modicon gợi ý theo loại vùng nhớ Modbus
const ADDRESS_PREFIX_HINTS = {
  Coil: '0',
  'Discrete Input': '1',
  'Input Register': '3',
  'Holding Register': '4',
};

module.exports = { DATA_TYPES, DATA_TYPE_NAME_TO_CODE, RW_ACCESS, ADDRESS_PREFIX_HINTS };
