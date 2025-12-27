// FILE: infinosbackend/seedCoolingDevices.js
// Script to add cooling-only devices to Supabase

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

async function seedCoolingDevices() {
  try {
    console.log('🌱 Seeding cooling-only devices to Supabase...\n');

    const devices = [];

    // Create 5 Cooling-Only Bags
    console.log('❄️ Creating Cooling-Only Bags...');
    for (let i = 1; i <= 5; i++) {
      const code = generateDeviceCode();
      const secret = generateDeviceSecret();

      const { data, error } = await supabase
        .from('devices')
        .insert({
          name: `Cooling-Only Bag ${i}`,
          device_code: code,
          device_secret: secret,
          bag_type: 'cooling-only',
          status: false,
          is_claimed: false,
          // Hot zone should be null for cooling-only
          hot_zone_current_temp: null,
          hot_zone_target_temp: null,
          hot_zone_current_humidity: null,
          hot_zone_heater_on: null,
          hot_zone_fan_on: null,
          // Cold zone is active for cooling-only
          cold_zone_current_temp: 25,
          cold_zone_target_temp: 5,
          cold_zone_current_humidity: 60,
          cold_zone_cooler_on: false,
          cold_zone_fan_on: false,
          // Battery
          battery_charge_level: 100,
          battery_voltage: 12.6,
          battery_is_charging: false,
          // Safety limits
          safety_min_temp: 0,
          safety_max_temp: 100,
          safety_low_battery: 20,
          created_at: new Date().toISOString()
        })
        .select()
        .single();

      if (error) {
        console.error(`❌ Error creating device ${i}:`, error);
        continue;
      }

      devices.push({ type: 'cooling-only', code, secret, id: data.id });
      console.log(`  ✅ Cooling-Only Bag ${i} - ${code}`);
    }

    console.log('\n' + '='.repeat(60));
    console.log('✨ Seeding completed!');
    console.log('='.repeat(60));

    console.log(`\n🧪 Created ${devices.length} cooling-only devices:`);
    devices.forEach((device, index) => {
      console.log(`\n${index + 1}. ${device.code}`);
      console.log(`   Secret: ${device.secret}`);
    });

    console.log('\n✅ All cooling-only devices have been added to the database!');
    console.log('📱 Users can now claim these devices using their device codes.');

    process.exit(0);
  } catch (err) {
    console.error('❌ Seeding error:', err);
    process.exit(1);
  }
}

seedCoolingDevices();