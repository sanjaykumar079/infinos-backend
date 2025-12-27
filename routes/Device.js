// FILE: infinosbackend/routes/Device.js
// UPDATED - Add simulator integration when device status changes

const express = require('express');
const router = express.Router();
const supabase = require('../config/supabase');
const { verifyToken, verifyAdmin, optionalAuth } = require('../middleware/authMiddleware');
const crypto = require('crypto');
const deviceSimulator = require('../services/deviceSimulator'); // ADD THIS

// ... (keep all existing helper functions and routes)
const authenticateAdminPasskey = (req, res, next) => {
  const adminPasskey = req.headers['x-admin-passkey'];
  const ADMIN_PASSKEY = process.env.ADMIN_PASSKEY || 'infinos-admin-2024';

  if (!adminPasskey || adminPasskey !== ADMIN_PASSKEY) {
    return res.status(403).json({ message: 'Unauthorized: Invalid admin passkey' });
  }

  next();
};

// Admin: Create new device
router.post('/create', authenticateAdminPasskey, async (req, res) => {
  try {
    const { name, device_code, bag_type } = req.body;

    // Validate required fields
    if (!name || !device_code || !bag_type) {
      return res.status(400).json({ 
        message: 'Missing required fields: name, device_code, and bag_type are required' 
      });
    }

    // Check if device code already exists
    const existingDevice = await Device.findOne({ device_code });
    if (existingDevice) {
      return res.status(400).json({ 
        message: 'Device code already exists. Please use a unique code.' 
      });
    }

    // Validate bag type
    const validBagTypes = ['dual-zone', 'heating-only', 'cooling-only'];
    if (!validBagTypes.includes(bag_type)) {
      return res.status(400).json({ 
        message: 'Invalid bag type. Must be: dual-zone, heating-only, or cooling-only' 
      });
    }

    // Create new device
    const newDevice = new Device({
      name,
      device_code,
      bag_type,
      status: false,
      is_claimed: false,
      battery_charge_level: 100,
      hot_zone_current_temp: 0,
      hot_zone_target_temp: 0,
      hot_zone_heater_on: false,
      hot_zone_fan_on: false,
      cold_zone_current_temp: 0,
      cold_zone_target_temp: 0,
      cold_zone_cooler_on: false,
      cold_zone_fan_on: false,
      safety_low_temp: 0,
      safety_high_temp: 100,
      last_seen: null
    });

    await newDevice.save();

    res.status(201).json({
      message: 'Device created successfully',
      device: newDevice
    });

  } catch (err) {
    console.error('Error creating device:', err);
    res.status(500).json({ 
      message: 'Failed to create device',
      error: err.message 
    });
  }
});

// Helper function to generate device code
const generateDeviceCode = () => {
  const part1 = Math.random().toString(36).substring(2, 6).toUpperCase();
  const part2 = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `INF-${part1}-${part2}`;
};

// Helper function to generate device secret
const generateDeviceSecret = () => {
  return crypto.randomBytes(32).toString('hex');
};

// Normalize Supabase rows into the shape expected by the frontend
const formatDeviceListItem = (device) => ({
  _id: device.id,
  id: device.id,
  name: device.name,
  deviceCode: device.device_code,
  bagType: device.bag_type,
  status: device.status,
  lastSeen: device.last_seen,
  hotZone: {
    currentTemp: device.hot_zone_current_temp,
    targetTemp: device.hot_zone_target_temp,
    currentHumidity: device.hot_zone_current_humidity,
    heaterOn: device.hot_zone_heater_on,
    fanOn: device.hot_zone_fan_on,
  },
  coldZone: device.bag_type === 'dual-zone' ? {
    currentTemp: device.cold_zone_current_temp,
    targetTemp: device.cold_zone_target_temp,
    currentHumidity: device.cold_zone_current_humidity,
    coolerOn: device.cold_zone_cooler_on,
    fanOn: device.cold_zone_fan_on,
  } : null,
  battery: {
    chargeLevel: device.battery_charge_level,
    voltage: device.battery_voltage,
    isCharging: device.battery_is_charging,
  },
  safetyLimits: {
    minTemp: device.safety_min_temp,
    maxTemp: device.safety_max_temp,
    lowBattery: device.safety_low_battery,
  },
});

// ============================================
// PUBLIC ENDPOINTS
// ============================================

// Authenticate device (for simulator/hardware)
router.post('/auth', async (req, res) => {
  try {
    const { deviceCode, deviceSecret } = req.body;

    const { data: device, error } = await supabase
      .from('devices')
      .select('*')
      .eq('device_code', deviceCode)
      .eq('device_secret', deviceSecret)
      .single();

    if (error || !device) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    await supabase
      .from('devices')
      .update({ last_seen: new Date().toISOString() })
      .eq('id', device.id);

    res.json({ 
      authenticated: true,
      device: {
        id: device.id,
        deviceCode: device.device_code,
        bagType: device.bag_type
      }
    });
  } catch (err) {
    console.error('Auth error:', err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// Verify device code (for claiming)
router.get('/verify-code', async (req, res) => {
  try {
    const { deviceCode } = req.query;

    const { data: device, error } = await supabase
      .from('devices')
      .select('*')
      .eq('device_code', deviceCode)
      .single();

    if (error || !device) {
      return res.status(404).json({ 
        valid: false,
        message: 'Invalid device code' 
      });
    }

    if (device.is_claimed) {
      return res.status(400).json({ 
        valid: false,
        message: 'Bag already claimed' 
      });
    }

    res.json({ 
      valid: true,
      device: {
        deviceCode: device.device_code,
        bagType: device.bag_type,
        bagTypeName: device.bag_type === 'dual-zone' ? 'Hot & Cold Zones' : 'Heating Only',
        hardwareVersion: device.hardware_version,
        manufacturingDate: device.manufacturing_date
      }
    });
  } catch (err) {
    console.error('Verify code error:', err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// ============================================
// AUTHENTICATED USER ENDPOINTS
// ============================================

// Claim device
router.post('/claim', verifyToken, async (req, res) => {
  try {
    const { deviceCode, ownerId, deviceName } = req.body;

    if (req.user.id !== ownerId) {
      return res.status(403).json({ 
        message: 'Unauthorized to claim device for another user' 
      });
    }

    const { data: device, error: fetchError } = await supabase
      .from('devices')
      .select('*')
      .eq('device_code', deviceCode)
      .single();

    if (fetchError || !device) {
      return res.status(404).json({ 
        message: 'Delivery bag not found. Please check your code.' 
      });
    }

    if (device.is_claimed) {
      return res.status(400).json({ 
        message: 'This bag has already been claimed.' 
      });
    }

    const { data: updated, error: updateError } = await supabase
      .from('devices')
      .update({
        owner_id: ownerId,
        is_claimed: true,
        claimed_at: new Date().toISOString(),
        name: deviceName,
        last_seen: new Date().toISOString()
      })
      .eq('id', device.id)
      .select()
      .single();

    if (updateError) {
      throw updateError;
    }

    res.json({ 
      message: 'Delivery bag claimed successfully!',
      device: {
        id: updated.id,
        name: updated.name,
        deviceCode: updated.device_code,
        bagType: updated.bag_type,
        status: updated.status
      }
    });
  } catch (err) {
    console.error('Claim error:', err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// Get user's devices
router.get('/my-devices', verifyToken, async (req, res) => {
  try {
    const { ownerId } = req.query;

    if (req.user.id !== ownerId) {
      return res.status(403).json({ 
        message: 'Unauthorized to access other user devices' 
      });
    }

    const { data: devices, error } = await supabase
      .from('devices')
      .select('*')
      .eq('owner_id', ownerId)
      .eq('is_claimed', true)
      .order('claimed_at', { ascending: false });

    if (error) throw error;

    const formatted = (devices || []).map(formatDeviceListItem);
    res.json(formatted);
  } catch (err) {
    console.error('Fetch devices error:', err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// Get device summary
router.get('/summary', verifyToken, async (req, res) => {
  try {
    const { ownerId } = req.query;

    if (req.user.id !== ownerId) {
      return res.status(403).json({ 
        message: 'Unauthorized to access other user data' 
      });
    }

    const { data: devices, error } = await supabase
      .from('devices')
      .select('*')
      .eq('owner_id', ownerId)
      .eq('is_claimed', true);

    if (error) throw error;

    const total = devices.length;
    const online = devices.filter(d => d.status === true).length;
    const dualZone = devices.filter(d => d.bag_type === 'dual-zone').length;
    const heatingOnly = devices.filter(d => d.bag_type === 'heating-only').length;

    const formattedDevices = (devices || []).map(formatDeviceListItem);

    res.json({
      totalDevices: total,
      onlineDevices: online,
      offlineDevices: total - online,
      dualZoneBags: dualZone,
      heatingOnlyBags: heatingOnly,
      devices: formattedDevices,
    });
  } catch (err) {
    console.error('Summary error:', err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// Get specific device
router.get('/get_device', verifyToken, async (req, res) => {
  try {
    const { device_id } = req.query;

    const { data: device, error } = await supabase
      .from('devices')
      .select('*')
      .eq('id', device_id)
      .single();

    if (error) {
      return res.status(404).json({ message: 'Device not found' });
    }

    if (device.owner_id !== req.user.id) {
      return res.status(403).json({ 
        message: 'Unauthorized to access this device' 
      });
    }

    // Get recent temperature readings
    const { data: hotReadings } = await supabase
      .from('temperature_readings')
      .select('*')
      .eq('device_id', device_id)
      .eq('zone', 'hot')
      .order('timestamp', { ascending: false })
      .limit(100);

    const { data: coldReadings } = await supabase
      .from('temperature_readings')
      .select('*')
      .eq('device_id', device_id)
      .eq('zone', 'cold')
      .order('timestamp', { ascending: false })
      .limit(100);

    const { data: batteryReadings } = await supabase
      .from('battery_readings')
      .select('*')
      .eq('device_id', device_id)
      .order('timestamp', { ascending: false })
      .limit(100);

    const formattedDevice = {
      ...device,
      _id: device.id,
      hotZone: {
        currentTemp: device.hot_zone_current_temp,
        targetTemp: device.hot_zone_target_temp,
        currentHumidity: device.hot_zone_current_humidity,
        heaterOn: device.hot_zone_heater_on,
        fanOn: device.hot_zone_fan_on,
        tempHistory: hotReadings?.map(r => ({ 
          value: r.temperature, 
          timestamp: r.timestamp 
        })) || [],
        humidityHistory: hotReadings?.map(r => ({ 
          value: r.humidity, 
          timestamp: r.timestamp 
        })) || []
      },
      coldZone: device.bag_type === 'dual-zone' ? {
        currentTemp: device.cold_zone_current_temp,
        targetTemp: device.cold_zone_target_temp,
        currentHumidity: device.cold_zone_current_humidity,
        coolerOn: device.cold_zone_cooler_on,
        fanOn: device.cold_zone_fan_on,
        tempHistory: coldReadings?.map(r => ({ 
          value: r.temperature, 
          timestamp: r.timestamp 
        })) || [],
        humidityHistory: coldReadings?.map(r => ({ 
          value: r.humidity, 
          timestamp: r.timestamp 
        })) || []
      } : null,
      battery: {
        chargeLevel: device.battery_charge_level,
        voltage: device.battery_voltage,
        isCharging: device.battery_is_charging,
        chargeHistory: batteryReadings?.map(r => ({ 
          value: r.charge_level, 
          timestamp: r.timestamp 
        })) || []
      },
      safetyLimits: {
        minTemp: device.safety_min_temp,
        maxTemp: device.safety_max_temp,
        lowBattery: device.safety_low_battery
      }
    };

    res.json(formattedDevice);
  } catch (err) {
    console.error('Get device error:', err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// ⭐ UPDATED - Update device status with simulator integration
router.post('/update_device', optionalAuth, async (req, res) => {
  try {
    const { device_id, status } = req.body;

    // If authenticated as user, verify ownership
    if (req.user) {
      const { data: device } = await supabase
        .from('devices')
        .select('owner_id')
        .eq('id', device_id)
        .single();

      if (device && device.owner_id !== req.user.id) {
        return res.status(403).json({ 
          message: 'Unauthorized to update this device' 
        });
      }
    }

    const { data, error } = await supabase
      .from('devices')
      .update({ 
        status: status,
        last_seen: new Date().toISOString()
      })
      .eq('id', device_id)
      .select()
      .single();

    if (error) throw error;

    // ⭐ START/STOP SIMULATOR BASED ON STATUS
    if (status === true) {
      // Device turned ON - start simulation
      console.log(`🟢 Device ${device_id} turned ON - starting simulator`);
      await deviceSimulator.startSimulation(device_id);
    } else {
      // Device turned OFF - stop simulation
      console.log(`🔴 Device ${device_id} turned OFF - stopping simulator`);
      deviceSimulator.stopSimulation(device_id);
    }

    res.json(data);
  } catch (err) {
    console.error('Update device error:', err);
    res.status(400).json({ message: 'Update failed', error: err.message });
  }
});

// Update hot zone (keep existing - simulator will handle readings)
// Update hot zone (keep existing - simulator will handle readings)
router.post('/update_hot_zone', optionalAuth, async (req, res) => {
  try {
    const { device_id, temp, humidity } = req.body;

    // ✅ ADD THIS CHECK - cooling-only bags don't have hot zone
    const { data: device } = await supabase
      .from('devices')
      .select('bag_type')
      .eq('id', device_id)
      .single();

    if (device?.bag_type === 'cooling-only') {
      return res.status(400).json({ message: "This bag doesn't have a hot zone" });
    }

    const { error: updateError } = await supabase
      .from('devices')
      .update({
        hot_zone_current_temp: temp,
        hot_zone_current_humidity: humidity,
        last_seen: new Date().toISOString()
      })
      .eq('id', device_id);

    if (updateError) throw updateError;

    const { error: insertError } = await supabase
      .from('temperature_readings')
      .insert({
        device_id: device_id,
        zone: 'hot',
        temperature: temp,
        humidity: humidity,
        timestamp: new Date().toISOString()
      });

    if (insertError) throw insertError;

    res.json({ success: true });
  } catch (err) {
    console.error('Update hot zone error:', err);
    res.status(400).json({ message: 'Update failed', error: err.message });
  }
});

// Update cold zone (keep existing)
// Update cold zone (keep existing)
// Update cold zone (keep existing)
router.post('/update_cold_zone', optionalAuth, async (req, res) => {
  try {
    const { device_id, temp, humidity } = req.body;

    const { data: device } = await supabase
      .from('devices')
      .select('bag_type')
      .eq('id', device_id)
      .single();

    // ✅ CHANGE THIS - cold zone exists for dual-zone AND cooling-only
    if (device?.bag_type === 'heating-only') {
      return res.status(400).json({ message: "This bag doesn't have a cold zone" });
    }

    const { error: updateError } = await supabase
      .from('devices')
      .update({
        cold_zone_current_temp: temp,
        cold_zone_current_humidity: humidity,
        last_seen: new Date().toISOString()
      })
      .eq('id', device_id);

    if (updateError) throw updateError;

    const { error: insertError } = await supabase
      .from('temperature_readings')
      .insert({
        device_id: device_id,
        zone: 'cold',
        temperature: temp,
        humidity: humidity,
        timestamp: new Date().toISOString()
      });

    if (insertError) throw insertError;

    res.json({ success: true });
  } catch (err) {
    console.error('Update cold zone error:', err);
    res.status(400).json({ message: 'Update failed', error: err.message });
  }
});

// Update battery (keep existing)
router.post('/update_battery', optionalAuth, async (req, res) => {
  try {
    const { device_id, charge_level, voltage, is_charging } = req.body;

    const { error: updateError } = await supabase
      .from('devices')
      .update({
        battery_charge_level: charge_level,
        battery_voltage: voltage,
        battery_is_charging: is_charging,
        last_seen: new Date().toISOString()
      })
      .eq('id', device_id);

    if (updateError) throw updateError;

    const { error: insertError } = await supabase
      .from('battery_readings')
      .insert({
        device_id: device_id,
        charge_level: charge_level,
        voltage: voltage,
        is_charging: is_charging,
        timestamp: new Date().toISOString()
      });

    if (insertError) throw insertError;

    res.json({ success: true });
  } catch (err) {
    console.error('Update battery error:', err);
    res.status(400).json({ message: 'Update failed', error: err.message });
  }
});

// Update hot zone settings
// Update hot zone settings
router.post('/update_hot_zone_settings', verifyToken, async (req, res) => {
  try {
    const { device_id, target_temp, heater_on, fan_on } = req.body;

    const { data: device } = await supabase
      .from('devices')
      .select('owner_id, bag_type')  // ✅ ADD bag_type
      .eq('id', device_id)
      .single();

    if (device.owner_id !== req.user.id) {
      return res.status(403).json({ 
        message: 'Unauthorized to update this device' 
      });
    }

    // ✅ ADD THIS CHECK
    if (device?.bag_type === 'cooling-only') {
      return res.status(400).json({ message: "This bag doesn't have a hot zone" });
    }

    if (device.owner_id !== req.user.id) {
      return res.status(403).json({ 
        message: 'Unauthorized to update this device' 
      });
    }

    const { data, error } = await supabase
      .from('devices')
      .update({
        hot_zone_target_temp: target_temp,
        hot_zone_heater_on: heater_on,
        hot_zone_fan_on: fan_on
      })
      .eq('id', device_id)
      .select()
      .single();

    if (error) throw error;

    res.json({ success: true, data });
  } catch (err) {
    console.error('Update hot zone settings error:', err);
    res.status(400).json({ message: 'Update failed', error: err.message });
  }
});

// Update cold zone settings
// Update cold zone settings
router.post('/update_cold_zone_settings', verifyToken, async (req, res) => {
  try {
    const { device_id, target_temp, cooler_on, fan_on } = req.body;

    const { data: device } = await supabase
      .from('devices')
      .select('owner_id, bag_type')
      .eq('id', device_id)
      .single();

    if (device.owner_id !== req.user.id) {
      return res.status(403).json({ 
        message: 'Unauthorized to update this device' 
      });
    }

    // ✅ CHANGE THIS - cold zone exists for dual-zone AND cooling-only
    if (device?.bag_type === 'heating-only') {
      return res.status(400).json({ message: "This bag doesn't have a cold zone" });
    }

    const { data: updated, error } = await supabase
      .from('devices')
      .update({
        cold_zone_target_temp: target_temp,
        cold_zone_cooler_on: cooler_on,
        cold_zone_fan_on: fan_on
      })
      .eq('id', device_id)
      .select()
      .single();

    if (error) throw error;

    res.json({ success: true, data: updated });
  } catch (err) {
    console.error('Update cold zone settings error:', err);
    res.status(400).json({ message: 'Update failed', error: err.message });
  }
});

// Get alerts
router.get('/alerts', verifyToken, async (req, res) => {
  try {
    const { device_id } = req.query;

    const { data: device, error } = await supabase
      .from('devices')
      .select('*')
      .eq('id', device_id)
      .single();

    if (error) throw error;

    if (device.owner_id !== req.user.id) {
      return res.status(403).json({ 
        message: 'Unauthorized to access this device' 
      });
    }

    const alerts = [];

    if (device.hot_zone_current_temp < device.safety_min_temp) {
      alerts.push({
        type: 'danger',
        zone: 'hot',
        message: `Hot zone too cold: ${device.hot_zone_current_temp.toFixed(1)}°C`
      });
    }
    if (device.hot_zone_current_temp > device.safety_max_temp) {
      alerts.push({
        type: 'danger',
        zone: 'hot',
        message: `Hot zone too hot: ${device.hot_zone_current_temp.toFixed(1)}°C`
      });
    }

    if (device.bag_type === 'dual-zone') {
      if (device.cold_zone_current_temp < device.safety_min_temp) {
        alerts.push({
          type: 'danger',
          zone: 'cold',
          message: `Cold zone too cold: ${device.cold_zone_current_temp.toFixed(1)}°C`
        });
      }
      if (device.cold_zone_current_temp > device.safety_max_temp) {
        alerts.push({
          type: 'danger',
          zone: 'cold',
          message: `Cold zone too hot: ${device.cold_zone_current_temp.toFixed(1)}°C`
        });
      }
    }

    if (device.battery_charge_level < device.safety_low_battery) {
      alerts.push({
        type: 'warning',
        message: `Low battery: ${device.battery_charge_level.toFixed(1)}%`
      });
    }

    res.json({ alerts });
  } catch (err) {
    console.error('Get alerts error:', err);
    res.status(400).json({ message: 'Failed to get alerts', error: err.message });
  }
});

// ============================================
// ADMIN ENDPOINTS
// ============================================

// Get all devices (admin only)
router.get('/all-devices', async (req, res) => {
  try {
    const adminPasskey = req.headers['x-admin-passkey'];
    const expectedPasskey = process.env.ADMIN_PASSKEY || 'INFINOS2025ADMIN';

    if (!adminPasskey || adminPasskey !== expectedPasskey) {
      return res.status(403).json({ 
        message: 'Admin authentication required' 
      });
    }

    const { data: devices, error } = await supabase
      .from('devices')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;

    res.json(devices || []);
  } catch (err) {
    console.error('Get all devices error:', err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// Get admin statistics
router.get('/admin-stats', async (req, res) => {
  try {
    const adminPasskey = req.headers['x-admin-passkey'];
    const expectedPasskey = process.env.ADMIN_PASSKEY || 'INFINOS2025ADMIN';

    if (!adminPasskey || adminPasskey !== expectedPasskey) {
      return res.status(403).json({ 
        message: 'Admin authentication required' 
      });
    }

    const { data: devices, error } = await supabase
      .from('devices')
      .select('*');

    if (error) throw error;

    const totalDevices = devices.length;
    const onlineDevices = devices.filter(d => d.status === true).length;
    const dualZone = devices.filter(d => d.bag_type === 'dual-zone').length;
    const heatingOnly = devices.filter(d => d.bag_type === 'heating-only').length;
    const claimed = devices.filter(d => d.is_claimed === true).length;
    
    const uniqueOwners = new Set(
      devices
        .filter(d => d.owner_id)
        .map(d => d.owner_id)
    ).size;

    res.json({
      totalDevices,
      onlineDevices,
      offlineDevices: totalDevices - onlineDevices,
      dualZoneBags: dualZone,
      heatingOnlyBags: heatingOnly,
      claimedDevices: claimed,
      unclaimedDevices: totalDevices - claimed,
      uniqueOwners
    });
  } catch (err) {
    console.error('Get admin stats error:', err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// Seed devices (admin only)
router.post('/seed-devices', async (req, res) => {
  try {
    const adminPasskey = req.headers['x-admin-passkey'];
    const expectedPasskey = process.env.ADMIN_PASSKEY || 'INFINOS2025ADMIN';

    if (!adminPasskey || adminPasskey !== expectedPasskey) {
      return res.status(403).json({ 
        message: 'Admin authentication required' 
      });
    }

    const { bagType, quantity } = req.body;
// ✅ ADD 'cooling-only' to valid types
    if (!bagType || !['dual-zone', 'heating-only', 'cooling-only'].includes(bagType)) {
      return res.status(400).json({ 
        message: 'Invalid bag type. Must be "dual-zone", "heating-only", or "cooling-only"' 
      });
    }

    if (!quantity || quantity < 1 || quantity > 100) {
      return res.status(400).json({ 
        message: 'Quantity must be between 1 and 100' 
      });
    }

    const devicesToCreate = [];
    for (let i = 0; i < quantity; i++) {
      // ✅ CHANGE THIS LINE to include cooling-only
      const bagName = bagType === 'dual-zone' ? 'Dual-Zone' : 
                      bagType === 'cooling-only' ? 'Cooling-Only' : 
                      'Heating-Only';
      
      const baseDevice = {
        name: `${bagName} Bag ${Date.now()}-${i}`,
        device_code: generateDeviceCode(),
        device_secret: generateDeviceSecret(),
        bag_type: bagType,
        hardware_version: 'v2.0',
        manufacturing_date: new Date().toISOString(),
        status: false,
        is_claimed: false,
        battery_charge_level: 100,
        battery_voltage: 12.6,
        battery_is_charging: false,
        safety_min_temp: 0,
        safety_max_temp: 100,
        safety_low_battery: 20,
        created_at: new Date().toISOString()
      };

      // ✅ ADD THIS - Configure zones based on bag type
      if (bagType === 'cooling-only') {
        // Cooling-only: No hot zone, only cold zone
        devicesToCreate.push({
          ...baseDevice,
          hot_zone_current_temp: null,
          hot_zone_target_temp: null,
          hot_zone_current_humidity: null,
          hot_zone_heater_on: null,
          hot_zone_fan_on: null,
          cold_zone_current_temp: 25,
          cold_zone_target_temp: 5,
          cold_zone_current_humidity: 60,
          cold_zone_cooler_on: false,
          cold_zone_fan_on: false,
        });
      } else if (bagType === 'heating-only') {
        // Heating-only: Only hot zone, no cold zone
        devicesToCreate.push({
          ...baseDevice,
          hot_zone_current_temp: 25,
          hot_zone_target_temp: 60,
          hot_zone_current_humidity: 50,
          hot_zone_heater_on: false,
          hot_zone_fan_on: false,
          cold_zone_current_temp: null,
          cold_zone_target_temp: null,
          cold_zone_current_humidity: null,
          cold_zone_cooler_on: null,
          cold_zone_fan_on: null,
        });
      } else {
        // Dual-zone: Both hot and cold zones
        devicesToCreate.push({
          ...baseDevice,
          hot_zone_current_temp: 25,
          hot_zone_target_temp: 60,
          hot_zone_current_humidity: 50,
          hot_zone_heater_on: false,
          hot_zone_fan_on: false,
          cold_zone_current_temp: 25,
          cold_zone_target_temp: 5,
          cold_zone_current_humidity: 60,
          cold_zone_cooler_on: false,
          cold_zone_fan_on: false,
        });
      }
    }

    const { data: createdDevices, error } = await supabase
      .from('devices')
      .insert(devicesToCreate)
      .select();

    if (error) throw error;

    res.json({
      success: true,
      message: `Successfully created ${quantity} ${bagType} device(s)`,
      devices: createdDevices.map(d => ({
        code: d.device_code,
        secret: d.device_secret,
        type: d.bag_type
      }))
    });
  } catch (err) {
    console.error('Seed devices error:', err);
    res.status(500).json({ 
      message: 'Failed to create devices', 
      error: err.message 
    });
  }
});

module.exports = router;