// FILE: infinosbackend/services/deviceSimulator.js
// CREATE THIS NEW FILE - Simulates temperature readings for claimed devices

const supabase = require('../config/supabase');

class DeviceSimulator {
  constructor() {
    this.runningSimulations = new Map(); // deviceId -> intervalId
    this.simulationIntervals = new Map(); // deviceId -> interval time
  }

  /**
   * Simulate temperature changes based on heater/cooler state
   */
  simulateTemperature(current, target, isActive, ambientTemp = 25) {
    if (!isActive) {
      // Drift towards ambient temperature when inactive
      const diff = ambientTemp - current;
      return current + (diff * 0.05); // 5% drift per update
    }

    // Move towards target when active
    const diff = target - current;
    if (Math.abs(diff) < 0.5) {
      // Add small random variation when near target
      return current + (Math.random() - 0.5) * 0.3;
    }

    // Move 2 degrees per update towards target
    return current + (diff > 0 ? 2 : -2);
  }

  /**
   * Simulate humidity (varies with temperature)
   */
  simulateHumidity(currentTemp, baseHumidity = 50) {
    // Humidity decreases as temperature increases
    const tempFactor = (currentTemp - 25) * -0.5;
    const randomVariation = (Math.random() - 0.5) * 5;
    return Math.max(10, Math.min(90, baseHumidity + tempFactor + randomVariation));
  }

  /**
   * Simulate battery drain
   */
  simulateBattery(current, isActive) {
    const drainRate = isActive ? 0.5 : 0.1; // % per update
    return Math.max(0, current - drainRate);
  }

  /**
   * Start simulation for a device
   */
  async startSimulation(deviceId, intervalMs = 5000) {
    try {
      // Check if already running
      if (this.runningSimulations.has(deviceId)) {
        console.log(`⚠️ Simulation already running for device ${deviceId}`);
        return { success: false, message: 'Simulation already running' };
      }

      console.log(`🚀 Starting simulation for device ${deviceId}`);

      // Create simulation loop
      const intervalId = setInterval(async () => {
        await this.updateDeviceReadings(deviceId);
      }, intervalMs);

      this.runningSimulations.set(deviceId, intervalId);
      this.simulationIntervals.set(deviceId, intervalMs);

      // Run first update immediately
      await this.updateDeviceReadings(deviceId);

      console.log(`✅ Simulation started for device ${deviceId}`);
      return { success: true, message: 'Simulation started' };
    } catch (error) {
      console.error(`❌ Error starting simulation for ${deviceId}:`, error);
      return { success: false, message: error.message };
    }
  }

  /**
   * Stop simulation for a device
   */
  stopSimulation(deviceId) {
    const intervalId = this.runningSimulations.get(deviceId);
    
    if (intervalId) {
      clearInterval(intervalId);
      this.runningSimulations.delete(deviceId);
      this.simulationIntervals.delete(deviceId);
      console.log(`🛑 Stopped simulation for device ${deviceId}`);
      return { success: true, message: 'Simulation stopped' };
    }

    return { success: false, message: 'No simulation running' };
  }

  /**
   * Update device readings (called by interval)
   */
  async updateDeviceReadings(deviceId) {
    try {
      // Get current device state
      const { data: device, error: fetchError } = await supabase
        .from('devices')
        .select('*')
        .eq('id', deviceId)
        .single();

      if (fetchError || !device) {
        console.error(`❌ Device ${deviceId} not found, stopping simulation`);
        this.stopSimulation(deviceId);
        return;
      }

      // Check if device is still online
      if (!device.status) {
        console.log(`⏸️ Device ${deviceId} is offline, stopping simulation`);
        this.stopSimulation(deviceId);
        return;
      }

      const timestamp = new Date().toISOString();

      // Simulate Hot Zone
      const newHotTemp = this.simulateTemperature(
        device.hot_zone_current_temp,
        device.hot_zone_target_temp,
        device.hot_zone_heater_on
      );
      const newHotHumidity = this.simulateHumidity(newHotTemp, 45);

      // Update hot zone
      await supabase
        .from('devices')
        .update({
          hot_zone_current_temp: Number(newHotTemp.toFixed(2)),
          hot_zone_current_humidity: Number(newHotHumidity.toFixed(1)),
          last_seen: timestamp,
        })
        .eq('id', deviceId);

      // Insert hot zone reading
      await supabase
        .from('temperature_readings')
        .insert({
          device_id: deviceId,
          zone: 'hot',
          temperature: Number(newHotTemp.toFixed(2)),
          humidity: Number(newHotHumidity.toFixed(1)),
          timestamp: timestamp,
        });

      // Simulate Cold Zone (if dual-zone)
      if (device.bag_type === 'dual-zone') {
        const newColdTemp = this.simulateTemperature(
          device.cold_zone_current_temp,
          device.cold_zone_target_temp,
          device.cold_zone_cooler_on
        );
        const newColdHumidity = this.simulateHumidity(newColdTemp, 60);

        await supabase
          .from('devices')
          .update({
            cold_zone_current_temp: Number(newColdTemp.toFixed(2)),
            cold_zone_current_humidity: Number(newColdHumidity.toFixed(1)),
          })
          .eq('id', deviceId);

        await supabase
          .from('temperature_readings')
          .insert({
            device_id: deviceId,
            zone: 'cold',
            temperature: Number(newColdTemp.toFixed(2)),
            humidity: Number(newColdHumidity.toFixed(1)),
            timestamp: timestamp,
          });
      }

      // Simulate Battery
      const isActive = device.hot_zone_heater_on || 
                       (device.bag_type === 'dual-zone' && device.cold_zone_cooler_on);
      const newBattery = this.simulateBattery(device.battery_charge_level, isActive);
      const newVoltage = 12.6 * (newBattery / 100);

      await supabase
        .from('devices')
        .update({
          battery_charge_level: Number(newBattery.toFixed(1)),
          battery_voltage: Number(newVoltage.toFixed(2)),
        })
        .eq('id', deviceId);

      await supabase
        .from('battery_readings')
        .insert({
          device_id: deviceId,
          charge_level: Number(newBattery.toFixed(1)),
          voltage: Number(newVoltage.toFixed(2)),
          is_charging: false,
          timestamp: timestamp,
        });

      console.log(`📊 Updated readings for ${deviceId}: Hot=${newHotTemp.toFixed(1)}°C, Battery=${newBattery.toFixed(1)}%`);
    } catch (error) {
      console.error(`❌ Error updating readings for ${deviceId}:`, error);
    }
  }

  /**
   * Get running simulations
   */
  getRunningSimulations() {
    return Array.from(this.runningSimulations.keys());
  }

  /**
   * Stop all simulations
   */
  stopAllSimulations() {
    console.log('🛑 Stopping all simulations...');
    this.runningSimulations.forEach((intervalId, deviceId) => {
      clearInterval(intervalId);
      console.log(`  Stopped simulation for ${deviceId}`);
    });
    this.runningSimulations.clear();
    this.simulationIntervals.clear();
    console.log('✅ All simulations stopped');
  }

  /**
   * Initialize simulations for all online devices
   */
  async initializeAllSimulations() {
    try {
      console.log('🔄 Initializing simulations for all online devices...');

      const { data: onlineDevices, error } = await supabase
        .from('devices')
        .select('id, name')
        .eq('status', true);

      if (error) {
        console.error('❌ Error fetching online devices:', error);
        return;
      }

      console.log(`📱 Found ${onlineDevices?.length || 0} online devices`);

      for (const device of onlineDevices || []) {
        await this.startSimulation(device.id);
      }

      console.log('✅ All simulations initialized');
    } catch (error) {
      console.error('❌ Error initializing simulations:', error);
    }
  }
}

// Create singleton instance
const deviceSimulator = new DeviceSimulator();

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\n🛑 Shutting down device simulator...');
  deviceSimulator.stopAllSimulations();
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n🛑 Shutting down device simulator...');
  deviceSimulator.stopAllSimulations();
  process.exit(0);
});

module.exports = deviceSimulator;