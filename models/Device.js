const mongoose = require("mongoose");
const Schema = mongoose.Schema;

// Reading History Schema (for temperature/humidity/battery tracking)
const ReadingSchema = new Schema({
  value: Number,
  timestamp: { type: Date, default: Date.now }
}, { _id: false });

// Smart Delivery Bag Device Schema
const DeviceSchema = new Schema({
  // Basic Info
  name: String,
  status: { type: Boolean, default: false },
  
  // Bag Category - SET DURING MANUFACTURING
  bagType: { 
    type: String, 
    enum: ['dual-zone', 'heating-only'],
    required: true,
    immutable: true  // Cannot be changed after creation
  },
  
  // Hot Zone (ALL bags have this)
  hotZone: {
    currentTemp: { type: Number, default: 25 },
    targetTemp: { type: Number, default: 65 },
    currentHumidity: { type: Number, default: 45 },
    heaterOn: { type: Boolean, default: false },
    fanOn: { type: Boolean, default: false },
    tempHistory: [ReadingSchema],
    humidityHistory: [ReadingSchema]
  },
  
  // Cold Zone (ONLY for dual-zone bags)
  coldZone: {
    currentTemp: { type: Number, default: 25 },
    targetTemp: { type: Number, default: 4 },
    currentHumidity: { type: Number, default: 60 },
    coolerOn: { type: Boolean, default: false },
    fanOn: { type: Boolean, default: false },
    tempHistory: [ReadingSchema],
    humidityHistory: [ReadingSchema]
  },
  
  // Battery (ALL bags have this)
  battery: {
    chargeLevel: { type: Number, default: 100 },
    voltage: { type: Number, default: 12.6 },
    isCharging: { type: Boolean, default: false },
    chargeHistory: [ReadingSchema]
  },
  
  // Safety Limits
  safetyLimits: {
    minTemp: { type: Number, default: 0 },
    maxTemp: { type: Number, default: 80 },
    lowBattery: { type: Number, default: 20 }
  },
  
  // User Ownership
  ownerId: { type: String, default: null },
  
  // Device Security
  deviceCode: { 
    type: String, 
    required: true, 
    unique: true,
    index: true 
  },
  deviceSecret: { 
    type: String, 
    required: true 
  },
  
  // Claiming Status
  isClaimed: { type: Boolean, default: false },
  claimedAt: Date,
  
  // Metadata
  manufacturingDate: { type: Date, default: Date.now },
  lastSeen: Date,
  hardwareVersion: { type: String, default: "v2.0" },
  firmwareVersion: { type: String, default: "2.1.0" },
  
  // Statistics
  stats: {
    totalDeliveries: { type: Number, default: 0 },
    totalRuntime: { type: Number, default: 0 }
  }
}, {
  timestamps: true
});

// Indexes
DeviceSchema.index({ deviceCode: 1, deviceSecret: 1 });
DeviceSchema.index({ ownerId: 1, isClaimed: 1, bagType: 1 });

// Update hot zone temperature
DeviceSchema.methods.updateHotZone = function(temp, humidity) {
  this.hotZone.currentTemp = temp;
  this.hotZone.currentHumidity = humidity;
  
  this.hotZone.tempHistory.push({ value: temp, timestamp: new Date() });
  this.hotZone.humidityHistory.push({ value: humidity, timestamp: new Date() });
  
  // Keep only last 100 readings
  if (this.hotZone.tempHistory.length > 100) {
    this.hotZone.tempHistory = this.hotZone.tempHistory.slice(-100);
  }
  if (this.hotZone.humidityHistory.length > 100) {
    this.hotZone.humidityHistory = this.hotZone.humidityHistory.slice(-100);
  }
  
  this.lastSeen = new Date();
  return this.save();
};

// Update cold zone temperature (only for dual-zone)
DeviceSchema.methods.updateColdZone = function(temp, humidity) {
  if (this.bagType !== 'dual-zone') {
    throw new Error('This bag does not have a cold zone');
  }
  
  this.coldZone.currentTemp = temp;
  this.coldZone.currentHumidity = humidity;
  
  this.coldZone.tempHistory.push({ value: temp, timestamp: new Date() });
  this.coldZone.humidityHistory.push({ value: humidity, timestamp: new Date() });
  
  if (this.coldZone.tempHistory.length > 100) {
    this.coldZone.tempHistory = this.coldZone.tempHistory.slice(-100);
  }
  if (this.coldZone.humidityHistory.length > 100) {
    this.coldZone.humidityHistory = this.coldZone.humidityHistory.slice(-100);
  }
  
  this.lastSeen = new Date();
  return this.save();
};

// Update battery
DeviceSchema.methods.updateBattery = function(chargeLevel, voltage, isCharging) {
  this.battery.chargeLevel = chargeLevel;
  this.battery.voltage = voltage;
  this.battery.isCharging = isCharging;
  
  this.battery.chargeHistory.push({ value: chargeLevel, timestamp: new Date() });
  
  if (this.battery.chargeHistory.length > 100) {
    this.battery.chargeHistory = this.battery.chargeHistory.slice(-100);
  }
  
  this.lastSeen = new Date();
  return this.save();
};

// Get alerts
DeviceSchema.methods.getAlerts = function() {
  const alerts = [];
  
  // Check hot zone
  if (this.hotZone.currentTemp < this.safetyLimits.minTemp) {
    alerts.push({
      type: 'danger',
      zone: 'hot',
      message: `Hot zone too cold: ${this.hotZone.currentTemp.toFixed(1)}°C`
    });
  }
  if (this.hotZone.currentTemp > this.safetyLimits.maxTemp) {
    alerts.push({
      type: 'danger',
      zone: 'hot',
      message: `Hot zone too hot: ${this.hotZone.currentTemp.toFixed(1)}°C`
    });
  }
  
  // Check cold zone (if dual-zone)
  if (this.bagType === 'dual-zone') {
    if (this.coldZone.currentTemp < this.safetyLimits.minTemp) {
      alerts.push({
        type: 'danger',
        zone: 'cold',
        message: `Cold zone too cold: ${this.coldZone.currentTemp.toFixed(1)}°C`
      });
    }
    if (this.coldZone.currentTemp > this.safetyLimits.maxTemp) {
      alerts.push({
        type: 'danger',
        zone: 'cold',
        message: `Cold zone too hot: ${this.coldZone.currentTemp.toFixed(1)}°C`
      });
    }
  }
  
  // Check battery
  if (this.battery.chargeLevel < this.safetyLimits.lowBattery) {
    alerts.push({
      type: 'warning',
      message: `Low battery: ${this.battery.chargeLevel.toFixed(1)}%`
    });
  }
  
  return alerts;
};

module.exports = Device = mongoose.model("Device", DeviceSchema);