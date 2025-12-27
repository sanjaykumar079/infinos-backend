require('dotenv').config();
const supabase = require('./config/supabase');
const crypto = require('crypto');

function generateDeviceCode() {
  const part1 = crypto.randomBytes(2).toString('hex').toUpperCase();
  const part2 = crypto.randomBytes(2).toString('hex').toUpperCase();
  return `INF-${part1}-${part2}`;
}

function generateDeviceSecret() {
  return crypto.randomBytes(32).toString('hex');
}

async function seedDevices() {
  try {
    console.log('🌱 Seeding devices to Supabase...\n');

    const devices = [];

    // Create 5 Dual-Zone Bags
    console.log('📦 Creating Dual-Zone Bags...');
    for (let i = 1; i <= 5; i++) {
      const code = generateDeviceCode();
      const secret = generateDeviceSecret();

      const { data, error } = await supabase
        .from('devices')
        .insert({
          name: `Dual-Zone Bag ${i}`,
          device_code: code,
          device_secret: secret,
          bag_type: 'dual-zone',
          status: false,
          is_claimed: false
        })
        .select()
        .single();

      if (error) {
        console.error(`❌ Error creating device ${i}:`, error);
        continue;
      }

      devices.push({ type: 'dual-zone', code, secret, id: data.id });
      console.log(`  ✅ Dual-Zone Bag ${i} - ${code}`);
    }

    // Create 5 Heating-Only Bags
    console.log('\n🔥 Creating Heating-Only Bags...');
    for (let i = 1; i <= 5; i++) {
      const code = generateDeviceCode();
      const secret = generateDeviceSecret();

      const { data, error } = await supabase
        .from('devices')
        .insert({
          name: `Heating Bag ${i}`,
          device_code: code,
          device_secret: secret,
          bag_type: 'heating-only',
          status: false,
          is_claimed: false
        })
        .select()
        .single();

      if (error) {
        console.error(`❌ Error creating device ${i}:`, error);
        continue;
      }

      devices.push({ type: 'heating-only', code, secret, id: data.id });
      console.log(`  ✅ Heating Bag ${i} - ${code}`);
    }

    console.log('\n' + '='.repeat(60));
    console.log('✨ Seeding completed!');
    console.log('='.repeat(60));

    console.log(`\n🧪 Use this for testing in deliveryBagSimulator.js:`);
    console.log(`   Code:   ${devices[0].code}`);
    console.log(`   Secret: ${devices[0].secret}`);

    process.exit(0);
  } catch (err) {
    console.error('❌ Seeding error:', err);
    process.exit(1);
  }
}

seedDevices();



// // seedDevices.js - Run this to create pre-manufactured devices with QR codes
// const mongoose = require("mongoose");
// const crypto = require("crypto");
// const Device = require("./models/Device");

// const DB_NAME = "sanju";
// const MONGO_URI = `mongodb+srv://sanju:sanju@cluster0.rl6u4ea.mongodb.net/${DB_NAME}?retryWrites=true&w=majority&appName=Cluster0`;

// mongoose.connect(MONGO_URI, {
//   useNewUrlParser: true,
//   useUnifiedTopology: true,
// });

// // Generate device code (like serial number)
// function generateDeviceCode() {
//   // Format: INF-XXXX-XXXX (e.g., INF-A7B3-9K2L)
//   const part1 = crypto.randomBytes(2).toString('hex').toUpperCase();
//   const part2 = crypto.randomBytes(2).toString('hex').toUpperCase();
//   return `INF-${part1}-${part2}`;
// }

// // Generate device secret (for authentication)
// function generateDeviceSecret() {
//   return crypto.randomBytes(32).toString('hex');
// }

// async function seedDevices() {
//   try {
//     console.log("🔌 Connected to MongoDB");

//     // Create 10 pre-manufactured devices
//     const devices = [];
//     const deviceCount = 10;

//     for (let i = 0; i < deviceCount; i++) {
//       const deviceCode = generateDeviceCode();
//       const deviceSecret = generateDeviceSecret();

//       const device = new Device({
//         name: `Device ${i + 1}`, // Default name, user can change after claiming
//         status: false,
//         heating: [],
//         cooling: [],
//         battery: [],
//         safety_low_temp: 0,
//         safety_high_temp: 100,
//         bag_temp: 25,
        
//         // Claiming fields
//         ownerId: null,  // Not claimed yet
//         isClaimed: false,
//         deviceCode: deviceCode,
//         deviceSecret: deviceSecret,
        
//         // Hardware info
//         hardwareVersion: "v1.0",
//         firmwareVersion: "1.0.0",
//         manufacturingDate: new Date(),
//       });

//       await device.save();
//       devices.push({
//         deviceCode,
//         deviceSecret,
//         _id: device._id
//       });

//       console.log(`✅ Created device ${i + 1}/${deviceCount}: ${deviceCode}`);
//     }

//     // Print all device codes for QR code generation
//     console.log("\n" + "=".repeat(60));
//     console.log("📋 DEVICE CODES FOR QR CODE GENERATION");
//     console.log("=".repeat(60));
    
//     devices.forEach((d, i) => {
//       console.log(`\n🔹 Device ${i + 1}:`);
//       console.log(`   Code:   ${d.deviceCode}`);
//       console.log(`   Secret: ${d.deviceSecret}`);
//       console.log(`   DB ID:  ${d._id}`);
//       console.log(`   QR:     ${d.deviceCode}`);
//     });

//     console.log("\n" + "=".repeat(60));
//     console.log("✨ SEEDING COMPLETED SUCCESSFULLY!");
//     console.log("=".repeat(60));
    
//     console.log(`\n💡 Next Steps:`);
//     console.log(`   1. Generate QR codes using the device codes above`);
//     console.log(`   2. Print QR codes on device boxes/labels`);
//     console.log(`   3. Users can scan QR or enter code to claim device`);
//     console.log(`   4. Update simulator.js with a device code and secret`);
//     console.log(`   5. Add components (heater/cooler/battery) via frontend`);
//     console.log(`   6. Run simulator to send test data`);

//     console.log(`\n📝 Sample Device for Testing:`);
//     console.log(`   Code:   ${devices[0].deviceCode}`);
//     console.log(`   Secret: ${devices[0].deviceSecret}`);
//     console.log(`\n   Copy these values to simulator.js!`);

//     mongoose.disconnect();
//   } catch (err) {
//     console.error("❌ Error seeding devices:", err);
//     mongoose.disconnect();
//   }
// }

// seedDevices();