import { db } from './db.js';


export async function seedData() {
  await db.executeMultiple(`
    UPDATE riders SET current_order_id = NULL;
    DELETE FROM credits;
    DELETE FROM refunds;
    DELETE FROM tickets;
    DELETE FROM inventory;
    DELETE FROM orders;
    DELETE FROM riders;
    DELETE FROM store_staff;
    DELETE FROM customers;
    DELETE FROM sqlite_sequence WHERE name IN ('customers','store_staff','riders','orders','inventory','tickets','refunds','credits');
  `);

  await db.executeMultiple(`
    INSERT INTO sqlite_sequence (name, seq) VALUES ('customers',  6000);
    INSERT INTO sqlite_sequence (name, seq) VALUES ('store_staff',8000);
    INSERT INTO sqlite_sequence (name, seq) VALUES ('riders',     7000);
    INSERT INTO sqlite_sequence (name, seq) VALUES ('orders',     5000);
    INSERT INTO sqlite_sequence (name, seq) VALUES ('inventory',  9000);
  `);

  // ── Customers (12)  IDs: 6001–6012 ─────────────────────────────────────────
  await db.executeMultiple(`
    INSERT INTO customers (name, phone, email, address) VALUES
      ('Ahmad Khalid',    '+962790520759', 'ahmad.khalid@example.com',    'Amman, Khalda, Building 12, Apt 4'),
      ('Sara Mahmoud',    '+962796143852', 'sara.mahmoud@example.com',    'Amman, Abdoun, Street 5, Apt 8'),
      ('Mohammed Omar',   '+962798372615', 'mohammed.omar@example.com',   'Zarqa, Rsaifah, Street 7'),
      ('Fatima Yousef',   '+962774923867', 'fatima.yousef@example.com',   'Amman, Sweifieh, Wakalat Street, Apt 12'),
      ('Omar Ibrahim',    '+962778561394', 'omar.ibrahim@example.com',    'Irbid, City Centre, Falah Street, Apt 3'),
      ('Layla Ahmad',     '+962791638254', 'layla.ahmad@example.com',     'Amman, Jabal Amman, 1st Circle, Apt 7'),
      ('Yousef Salem',    '+962796482031', 'yousef.salem@example.com',    'Aqaba, Nahda Street, Building 3'),
      ('Nour Hassan',     '+962773924816', 'nour.hassan@example.com',     'Amman, Shmeisani, Queen Nour Street'),
      ('Khalid Ali',      '+962782619435', 'khalid.ali@example.com',      'Madaba, King Hussein Street, House 4'),
      ('Rana Naser',      '+962779483162', 'rana.naser@example.com',      'Amman, Dabouk, Street 10, Villa 2'),
      ('Majed Hamdan',    '+962784629173', 'majed.hamdan@example.com',    'Amman, Tla Al Ali, City Street, Apt 6'),
      ('Heba Rashed',     '+962793817264', 'heba.rashed@example.com',     'Amman, Marj Al Hamam, Yasmine Building, Apt 9');
  `);
  // ── Store Staff (9)  IDs: 8001–8009 ────────────────────────────────────────
  await db.executeMultiple(`
    INSERT INTO store_staff (name, phone, store_id, role) VALUES
      ('Musa Hamdan',     '+962771529384', '1001', 'supervisor'),
      ('Hanadi Omar',     '+962784293618', '1001', 'picker'),
      ('Rashed Tawalbeh', '+962796253847', '1001', 'picker'),
      ('Suha Yaseen',     '+962778492651', '1002', 'supervisor'),
      ('Fadi Hijazi',     '+962791368524', '1002', 'picker'),
      ('Amal Dardakeh',   '+962783624197', '1002', 'picker'),
      ('Ziad Ahmad',      '+962779183624', '1003', 'supervisor'),
      ('Nedal Qasim',     '+962796742831', '1003', 'picker'),
      ('Hifa Marei',      '+962774836291', '1003', 'picker');
  `);

  // ── Riders (4)  IDs: 7001–7004 ─────────────────────────────────────────────
  await db.executeMultiple(`
    INSERT INTO riders (name, phone, status, account_status, earnings_total) VALUES
      ('Samer Bataineh', '+962796814523', 'on_delivery', 'active',    287.500),
      ('Malik Hourani',  '+962778362914', 'available',   'active',    195.250),
      ('Walid Sharayeh', '+962791274836', 'offline',     'active',    412.750),
      ('Nader Matalqah', '+962784139265', 'available',   'suspended',  98.000);
  `);

  // ── Orders (12)  IDs & order_numbers: 5001–5012 ─────────────────────────────
  await db.executeMultiple(`
    INSERT INTO orders (order_number, customer_id, rider_id, status, packing_stage, items, total_amount, delivery_address, eta_minutes, payment_method, payment_status) VALUES
      ('5001', 6001, 7001, 'out_for_delivery', 'packed',      '[{"name":"Pita Bread","qty":2,"price":1.5},{"name":"White Cheese","qty":1,"price":3.75},{"name":"Olive Oil","qty":1,"price":7.25}]',    12.500, 'Amman, Khalda, Building 12, Apt 4',             15,   'card', 'paid'),
      ('5002', 6002, NULL, 'preparing',         'picking',     '[{"name":"Milk","qty":2,"price":1.8},{"name":"Eggs","qty":1,"price":2.5},{"name":"Yogurt","qty":1,"price":1.2}]',                       8.300,  'Amman, Abdoun, Street 5, Apt 8',                30,   'cash', 'pending'),
      ('5003', 6003, 7002, 'delivered',         'packed',      '[{"name":"Frozen Chicken","qty":1,"price":6.5},{"name":"Rice","qty":1,"price":3.2},{"name":"Tomato Sauce","qty":2,"price":1.2}]',      12.100, 'Zarqa, Rsaifah, Street 7',                      0,    'card', 'paid'),
      ('5004', 6004, NULL, 'pending',           'not_started', '[{"name":"Thyme Mix","qty":1,"price":2.2},{"name":"Olive Oil","qty":1,"price":7.25}]',                                                 9.450,  'Amman, Sweifieh, Wakalat Street, Apt 12',       40,   'card', 'paid'),
      ('5005', 6001, NULL, 'cancelled',         'not_started', '[{"name":"Hummus","qty":2,"price":2.5}]',                                                                                              5.000,  'Amman, Khalda, Building 12, Apt 4',             NULL, 'card', 'refunded'),
      ('5006', 6002, NULL, 'out_for_delivery',  'packed',      '[{"name":"Tahini","qty":1,"price":3.5},{"name":"Pita Bread","qty":3,"price":1.5},{"name":"Eggs","qty":1,"price":2.5}]',               10.000, 'Amman, Abdoun, Street 5, Apt 8',                10,   'cash', 'pending'),
      ('5007', 6007, 7001, 'delivered',         'packed',      '[{"name":"Dates","qty":2,"price":4.5},{"name":"Mineral Water","qty":2,"price":2.2},{"name":"Lentils","qty":1,"price":3.8}]',           18.200, 'Aqaba, Nahda Street, Building 3',               0,    'cash', 'paid'),
      ('5008', 6003, NULL, 'preparing',         'not_started', '[{"name":"Green Pepper","qty":1,"price":1.8},{"name":"Frozen Chicken","qty":1,"price":6.5},{"name":"Mineral Water","qty":1,"price":2.2}]', 10.500, 'Zarqa, Rsaifah, Street 7',                 25,   'card', 'paid'),
      ('5009', 6005, NULL, 'pending',           'not_started', '[{"name":"Lentils","qty":1,"price":3.8},{"name":"Rice","qty":1,"price":3.2}]',                                                         7.000,  'Irbid, City Centre, Falah Street, Apt 3',       45,   'card', 'paid'),
      ('5010', 6010, 7002, 'out_for_delivery',  'packed',      '[{"name":"White Cheese","qty":1,"price":3.75},{"name":"Thyme Mix","qty":2,"price":2.2},{"name":"Orange Juice","qty":1,"price":1.8}]', 9.950,  'Amman, Dabouk, Street 10, Villa 2',             20,   'card', 'paid'),
      ('5011', 6011, NULL, 'pending',           'not_started', '[{"name":"Pita Bread","qty":4,"price":1.5},{"name":"Milk","qty":1,"price":1.8}]',                                                      7.800,  'Amman, Tla Al Ali, City Street, Apt 6',         35,   'card', 'paid'),
      ('5012', 6012, NULL, 'out_for_delivery',  'packed',      '[{"name":"Dates","qty":1,"price":4.5},{"name":"Olive Oil","qty":1,"price":7.25},{"name":"Tahini","qty":1,"price":3.5}]',              15.250, 'Amman, Marj Al Hamam, Yasmine Building, Apt 9', 18,   'cash', 'pending');
  `);

  await db.execute({
    sql: `UPDATE riders SET current_order_id = (SELECT id FROM orders WHERE order_number = '5001')
          WHERE phone = '+962796814523'`,
    args: [],
  });

  // ── Inventory (24)  IDs: 9001–9024 ─────────────────────────────────────────
  await db.executeMultiple(`
    INSERT INTO inventory (store_id, item_name, sku, quantity, status) VALUES
      ('1001', 'Pita Bread',    'APITA1',  50, 'in_stock'),
      ('1001', 'Milk',          'AMILK1',   0, 'out_of_stock'),
      ('1001', 'Eggs',          'AEGG1',   30, 'in_stock'),
      ('1001', 'Olive Oil',     'AOIL1',    8, 'in_stock'),
      ('1001', 'White Cheese',  'ACHE1',   12, 'in_stock'),
      ('1001', 'Hummus',        'AHUM1',    0, 'out_of_stock'),
      ('1001', 'Thyme Mix',     'AZAT1',   20, 'in_stock'),
      ('1001', 'Rice',          'ARIC1',    6, 'in_stock'),
      ('1001', 'Yogurt',        'AYOG1',    0, 'out_of_stock'),
      ('1001', 'Orange Juice',  'AOJC1',   15, 'in_stock'),
      ('1002', 'Toast Bread',   'BBREA1',  40, 'in_stock'),
      ('1002', 'Feta Cheese',   'BFETA1',   9, 'in_stock'),
      ('1002', 'Greek Yogurt',  'BYOG1',    0, 'out_of_stock'),
      ('1002', 'Jam',           'BJAM1',   14, 'in_stock'),
      ('1002', 'Tuna',          'BTUN1',    0, 'out_of_stock'),
      ('1002', 'Noodles',       'BNOOD1',  22, 'in_stock'),
      ('1002', 'Ketchup',       'BKET1',   11, 'in_stock'),
      ('1003', 'Frozen Chicken','ZCHK1',   10, 'in_stock'),
      ('1003', 'Tahini',        'ZTAH1',    9, 'in_stock'),
      ('1003', 'Green Pepper',  'ZPEP1',    0, 'out_of_stock'),
      ('1003', 'Dates',         'ZDAT1',   18, 'in_stock'),
      ('1003', 'Mineral Water', 'ZWAT1',   25, 'in_stock'),
      ('1003', 'Lentils',       'ZLEN1',    7, 'in_stock'),
      ('1003', 'Tomato Sauce',  'ZTOM1',    0, 'out_of_stock');
  `);

  // ── Tickets ─────────────────────────────────────────────────────────────────
  await db.executeMultiple(`
    INSERT INTO tickets (ticket_number, order_id, caller_type, caller_id, category, description, status, priority, transcript, resolved_by) VALUES
      ('T1001', 5001, 'customer',    6001, 'missing_item',         'Ahmad: زيت الزيتون مش موجود في الطلب — Olive oil was missing from order 5001',                       'open',      'normal', NULL,                                                                          NULL),
      ('T1002', 5002, 'store_staff', 8001, 'inventory_error',      'Milk shows as in-stock in the system but the shelf is empty',                                         'resolved',  'high',   NULL,                                                                          'Hanadi Omar'),
      ('T1003', 5003, 'customer',    6003, 'refund_request',       'Mohammed: الدجاج كان فاسد — requests refund for spoiled frozen chicken in order 5003',               'open',      'high',   'Agent: أهلاً، كيف أقدر أساعدك؟\nCustomer: الدجاج كان فاسد، بدي استرداد', NULL),
      ('T1004', 5001, 'rider',       7001, 'rider_delay',          'Samer stuck in traffic near 4th Circle, 20-minute delay on order 5001',                               'open',      'normal', NULL,                                                                          NULL),
      ('T1005', 5003, 'customer',    6003, 'quality_concern',      'Mohammed refuses credit and demands to speak to a manager about order 5003',                          'escalated', 'normal', 'Agent: أهلاً\nCustomer: بدي أحكي مع مدير',                                  NULL),
      ('T1006', NULL, 'store_staff', 8002, 'tablet_issue',         'Tablet in store 1001 crashes when confirming packed status',                                          'open',      'normal', NULL,                                                                          NULL),
      ('T1007', 5002, 'customer',    6002, 'wrong_item',           'Sara: استلمت لبن بدل جبنة — received yogurt instead of white cheese, credit added',                  'resolved',  'normal', NULL,                                                                          'ai-agent'),
      ('T1008', 5006, 'rider',       7001, 'customer_unreachable', 'Samer cannot reach Sara at delivery address for order 5006',                                          'open',      'normal', NULL,                                                                          NULL),
      ('T1009', 5004, 'customer',    6004, 'late_delivery',        'Fatima: الطلب تأخر كثير — order 5004 has been pending for over 40 minutes',                          'open',      'normal', NULL,                                                                          NULL),
      ('T1010', 5010, 'customer',    6010, 'missing_item',         'Rana: عصير البرتقال مش موجود — orange juice missing from order 5010',                                'open',      'normal', NULL,                                                                          NULL);
  `);

  // ── Refunds ─────────────────────────────────────────────────────────────────
  await db.executeMultiple(`
    INSERT INTO refunds (order_id, customer_id, amount, reason, status) VALUES
      (5005, 6001, 5.000, 'Order cancelled before packing started', 'completed');
  `);

  // ── Credits ─────────────────────────────────────────────────────────────────
  await db.executeMultiple(`
    INSERT INTO credits (customer_id, amount, reason, order_id) VALUES
      (6001, 2.500, 'Compensation for missing white cheese',  5001),
      (6001, 2.000, 'Quality issue on a previous order',      NULL),
      (6002, 2.500, 'Received yogurt instead of cheese',      5002);
  `);

  console.log('Seed data inserted successfully');
}
