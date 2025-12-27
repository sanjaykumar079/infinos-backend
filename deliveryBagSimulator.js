require('dotenv').config();
const axios = require("axios");

const API_URL = "http://localhost:4000/device";

// ⚠️ REPLACE WITH YOUR BAG CREDENTIALS
const DEVICE_CODE = "INF-9FC2-FDB3";
const DEVICE_SECRET = "2a69b0f16ab9ae8ef3a26ed33022897d6863f249ebd62c8cfb4a7cf3ddd759b7";

let deviceId = null;
let bagType = null;
let hotTemp = 25;
let coldTemp = 25;
let batteryLevel = 100;

function simulateTemp(current, target, isActive) {
  if (!isActive) {
    const diff = 25 - current;
    return current + (diff * 0.05);
  }
  const diff = target - current;
  if (Math.abs(diff) < 0.5) {
    return current + (Math.random() - 0.5);
  }
  return current + (diff > 0 ? 2 : -2);
}

async function authenticateDevice() {
  try {
    console.log("🔐 Authenticating bag...");
    console.log(`   Code: ${DEVICE_CODE}`);
    const response = await axios.post(`${API_URL}/auth`, {
      deviceCode: DEVICE_CODE,
      deviceSecret: DEVICE_SECRET
    });
    
    console.log("📦 Auth response:", JSON.stringify(response.data, null, 2));
    
    if (response.data.authenticated) {
      deviceId = response.data.device.id;
      bagType = response.data.device.bagType;
      
      console.log("✅ Authenticated!");
      console.log(`   Device ID: ${deviceId}`);
      console.log(`   Type: ${bagType}`);
      return true;
    } else {
      console.error("❌ Auth response missing authenticated flag");
      return false;
    }
  } catch (err) {
    console.error("❌ Auth failed:", err.response?.data || err.message);
    return false;
  }
}

async function sendData() {
  try {
    if (!deviceId) {
      console.error("❌ No device ID - skipping update");
      return;
    }

    await axios.post(`${API_URL}/update_device`, {
      device_id: deviceId,
      status: true
    });
    
    const deviceRes = await axios.get(`${API_URL}/get_device`, {
      params: { device_id: deviceId }
    });
    const device = deviceRes.data;

    // Simulate hot zone
    hotTemp = simulateTemp(hotTemp, device.hotZone.targetTemp, device.hotZone.heaterOn);
    const hotHumidity = 40 + (Math.random() * 10);

    await axios.post(`${API_URL}/update_hot_zone`, {
      device_id: deviceId,
      temp: Number(hotTemp.toFixed(2)),
      humidity: Number(hotHumidity.toFixed(1))
    });

    // Simulate cold zone (if dual-zone)
    if (bagType === 'dual-zone') {
      coldTemp = simulateTemp(coldTemp, device.coldZone.targetTemp, device.coldZone.coolerOn);
      const coldHumidity = 60 + (Math.random() * 10);
      
      await axios.post(`${API_URL}/update_cold_zone`, {
        device_id: deviceId,
        temp: Number(coldTemp.toFixed(2)),
        humidity: Number(coldHumidity.toFixed(1))
      });
    }

    // Simulate battery drain
    const isActive = device.hotZone.heaterOn || 
                     (bagType === 'dual-zone' && device.coldZone.coolerOn);
    batteryLevel = Math.max(0, batteryLevel - (isActive ? 0.5 : 0.1));

    await axios.post(`${API_URL}/update_battery`, {
      device_id: deviceId,
      charge_level: Number(batteryLevel.toFixed(1)),
      voltage: Number((12.6 * (batteryLevel / 100)).toFixed(2)),
      is_charging: false
    });

    const timestamp = new Date().toLocaleTimeString();
    console.log(`📡 [${timestamp}] Hot: ${hotTemp.toFixed(1)}°C${bagType === 'dual-zone' ? `, Cold: ${coldTemp.toFixed(1)}°C` : ''}, Battery: ${batteryLevel.toFixed(1)}%`);
  } catch (err) {
    console.error("❌ Error:", err.response?.data || err.message);
  }
}

async function main() {
  console.log("🚀 Starting Bag Simulator...\n");
  
  const authenticated = await authenticateDevice();
  if (!authenticated) {
    console.error("\n❌ Cannot start without authentication");
    process.exit(1);
  }
  
  console.log("\n📊 Starting monitoring (every 5 seconds)...\n");
  await sendData();
  setInterval(sendData, 5000);
}

process.on('SIGINT', async () => {
  console.log("\n\n🛑 Shutting down...");
  if (deviceId) {
    await axios.post(`${API_URL}/update_device`, {
      device_id: deviceId,
      status: false
    });
  }
  process.exit(0);
});

main();