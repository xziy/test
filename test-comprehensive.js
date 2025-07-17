const FormData = require('form-data');
const fs = require('fs');
const path = require('path');
const axios = require('axios');

const BASE_URL = 'http://localhost:3000';

// Создаем тестовые файлы если их нет
function createTestFiles() {
  const testDir = path.join(__dirname, 'test-files');
  if (!fs.existsSync(testDir)) {
    fs.mkdirSync(testDir);
  }

  // Создаем тестовое видео (небольшой файл)
  const videoPath = path.join(testDir, 'test-video.mp4');
  if (!fs.existsSync(videoPath)) {
    // Создаем минимальный MP4 файл (заголовок)
    const mp4Header = Buffer.from([
      0x00, 0x00, 0x00, 0x20, 0x66, 0x74, 0x79, 0x70, // ftyp box
      0x6D, 0x70, 0x34, 0x31, 0x00, 0x00, 0x00, 0x00,
      0x6D, 0x70, 0x34, 0x31, 0x69, 0x73, 0x6F, 0x6D,
      0x61, 0x76, 0x63, 0x31, 0x00, 0x00, 0x00, 0x00
    ]);
    fs.writeFileSync(videoPath, mp4Header);
  }

  // Создаем тестовые изображения (минимальный JPEG)
  const jpegHeader = Buffer.from([
    0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46,
    0x49, 0x46, 0x00, 0x01, 0x01, 0x01, 0x00, 0x48,
    0x00, 0x48, 0x00, 0x00, 0xFF, 0xD9
  ]);

  const carPhotoPath = path.join(testDir, 'test-car.jpg');
  if (!fs.existsSync(carPhotoPath)) {
    fs.writeFileSync(carPhotoPath, jpegHeader);
  }

  const fullPhotoPath = path.join(testDir, 'test-full.jpg');
  if (!fs.existsSync(fullPhotoPath)) {
    fs.writeFileSync(fullPhotoPath, jpegHeader);
  }

  return { videoPath, carPhotoPath, fullPhotoPath };
}

async function testAuth() {
  console.log('\n=== Testing PLINK Auth ===');
  try {
    const response = await axios.post(`${BASE_URL}/plink/auth`, {
      username: 'test_user',
      password: 'test_password'
    }, {
      headers: {
        'Content-Type': 'application/json'
      }
    });

    console.log('✅ Auth successful');
    console.log('Status:', response.status);
    console.log('Response type:', typeof response.data);
    console.log('Response keys:', Object.keys(response.data));
    
    // Возвращаем фейковый токен, так как httpbin.org не возвращает токен
    return 'fake-proxy-token';
  } catch (error) {
    console.log('❌ Auth failed');
    console.log('Error:', error.response?.data || error.message);
    return null;
  }
}

async function testVideoUploadProxy(token) {
  console.log('\n=== Testing PLINK Video Upload Proxy ===');
  
  const { videoPath, carPhotoPath, fullPhotoPath } = createTestFiles();
  
  try {
    const formData = new FormData();
    
    // Добавляем обязательные поля
    formData.append('id', 'proxy-test-789');
    formData.append('car_number', 'C789EF999');
    formData.append('the_date', '2025-07-16T12:00:00Z');
    formData.append('rule_id', 'SPEED_LIMIT');
    
    // Добавляем файлы
    formData.append('video', fs.createReadStream(videoPath), {
      filename: 'test-video.mp4',
      contentType: 'video/mp4'
    });
    formData.append('car_photo', fs.createReadStream(carPhotoPath), {
      filename: 'test-car.jpg',
      contentType: 'image/jpeg'
    });
    formData.append('full_photo', fs.createReadStream(fullPhotoPath), {
      filename: 'test-full.jpg',
      contentType: 'image/jpeg'
    });

    const response = await axios.post(`${BASE_URL}/plink/video/upload`, formData, {
      headers: {
        ...formData.getHeaders(),
        'Authorization': `Bearer ${token}`
      },
      timeout: 30000
    });

    console.log('✅ Video upload proxy successful');
    console.log('Status:', response.status);
    console.log('Response type:', typeof response.data);
    console.log('Response keys:', Object.keys(response.data));
    
    // Проверяем что данные переданы корректно
    if (response.data.form) {
      console.log('📝 Form data received by httpbin:');
      console.log('  - id:', response.data.form.id);
      console.log('  - car_number:', response.data.form.car_number);
      console.log('  - the_date:', response.data.form.the_date);
      console.log('  - rule_id:', response.data.form.rule_id);
    }
    
    if (response.data.files) {
      console.log('📎 Files received by httpbin:');
      Object.keys(response.data.files).forEach(key => {
        console.log(`  - ${key}: ${response.data.files[key].length} bytes`);
      });
    }
    
  } catch (error) {
    console.log('❌ Video upload proxy failed');
    console.log('Status:', error.response?.status);
    console.log('Error:', error.response?.data || error.message);
  }
}

async function testLocalUpload() {
  console.log('\n=== Testing Local Video Upload (mock) ===');
  
  const { videoPath, carPhotoPath, fullPhotoPath } = createTestFiles();
  
  try {
    // Сначала получаем токен от локального /auth
    const authResponse = await axios.post(`${BASE_URL}/auth`, {
      username: 'test_user',
      password: 'test_password'
    });
    
    const localToken = authResponse.data.data.token;
    console.log('Got local token:', localToken);
    
    const formData = new FormData();
    
    // Добавляем обязательные поля
    formData.append('id', 'local-test-456');
    formData.append('car_number', 'B456CD888');
    formData.append('the_date', '2025-07-16T12:00:00Z');
    formData.append('rule_id', 'SPEED_LIMIT');
    
    // Добавляем файлы
    formData.append('video', fs.createReadStream(videoPath), {
      filename: 'test-video.mp4',
      contentType: 'video/mp4'
    });
    formData.append('car_photo', fs.createReadStream(carPhotoPath), {
      filename: 'test-car.jpg',
      contentType: 'image/jpeg'
    });
    formData.append('full_photo', fs.createReadStream(fullPhotoPath), {
      filename: 'test-full.jpg',
      contentType: 'image/jpeg'
    });

    const response = await axios.post(`${BASE_URL}/video/upload`, formData, {
      headers: {
        ...formData.getHeaders(),
        'Authorization': `Bearer ${localToken}`
      },
      timeout: 30000
    });

    console.log('✅ Local video upload successful');
    console.log('Status:', response.status);
    console.log('Response:', response.data);
  } catch (error) {
    console.log('❌ Local video upload failed');
    console.log('Status:', error.response?.status);
    console.log('Error:', error.response?.data || error.message);
  }
}

async function testKaatAPIProxy() {
  console.log('\n=== Testing KAAT API Proxy ===');
  try {
    const response = await axios.post(`${BASE_URL}/kaat/billing-api/v1/device-event/create`, {
      pID: 'proxy-test-456',
      pDeviceNumber: 'DEVICE002',
      pViolation: 37,
      pPlateNumber: 'B456CD888',
      pValidSpeed: 60,
      pActualSpeed: 90,
      pViolationDate: '2025-07-16',
      pViolationTime: '13:00:00',
      pRegion: 'Proxy Test Region',
      pDistrict: 'Proxy Test District',
      pPlace: 'Proxy Test Place',
      pPlaceLatitude: 55.7558,
      pPlaceLongitude: 37.6176,
      pPhoto: '/9j/4AAQSkZJRgABAQEASABIAAD//gATQ3JlYXRlZCB3aXRoIEdJTVD/2wBDAAEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQH/2wBDAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQH/wAARCAAABAAECAYAAACEhIQRAREBAQ=',
      pPhotoPlate: '/9j/4AAQSkZJRgABAQEASABIAAD//gATQ3JlYXRlZCB3aXRoIEdJTVD/2wBDAAEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQH/2wBDAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQH/wAARCAAABAAECAYAAACEhIQRAREBAQ=',
      pPhotoAdditional: '/9j/4AAQSkZJRgABAQEASABIAAD//gATQ3JlYXRlZCB3aXRoIEdJTVD/2wBDAAEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQH/2wBDAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQH/wAARCAAABAAECAYAAACEhIQRAREBAQ=',
      pLink: 'https://example.com/proxy-video.mp4'
    }, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer test-kaat-token'
      }
    });

    console.log('✅ KAAT API Proxy successful');
    console.log('Status:', response.status);
    console.log('Response type:', typeof response.data);
    console.log('Response keys:', Object.keys(response.data));
    
    // Проверяем что данные переданы корректно
    if (response.data.json) {
      console.log('📝 JSON data received by httpbin:');
      console.log('  - pID:', response.data.json.pID);
      console.log('  - pDeviceNumber:', response.data.json.pDeviceNumber);
      console.log('  - pViolation:', response.data.json.pViolation);
      console.log('  - pPlateNumber:', response.data.json.pPlateNumber);
    }
  } catch (error) {
    console.log('❌ KAAT API Proxy failed');
    console.log('Status:', error.response?.status);
    console.log('Error:', error.response?.data || error.message);
  }
}

async function testCarSearchAPIProxy() {
  console.log('\n=== Testing Car Search API Proxy ===');
  try {
    const testEvents = [
      {
        pID: 'search-test-1',
        pDeviceNumber: 'DEVICE003',
        pViolation: 36,
        pPlateNumber: 'C123EF999',
        pActualSpeed: 70
      },
      {
        pID: 'search-test-2',
        pDeviceNumber: 'DEVICE004',
        pViolation: 37,
        pPlateNumber: 'D456GH111',
        pActualSpeed: 95
      }
    ];

    const response = await axios.post(`${BASE_URL}/kaat/car-search/v1/device-event/input-all`, testEvents, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer test-kaat-token'
      }
    });

    console.log('✅ Car Search API Proxy successful');
    console.log('Status:', response.status);
    console.log('Response type:', typeof response.data);
    console.log('Response keys:', Object.keys(response.data));
    
    // Проверяем что данные переданы корректно
    if (response.data.json && Array.isArray(response.data.json)) {
      console.log('📝 JSON array received by httpbin:');
      console.log(`  - Array length: ${response.data.json.length}`);
      response.data.json.forEach((event, i) => {
        console.log(`  - Event ${i}: pID=${event.pID}, device=${event.pDeviceNumber}, plate=${event.pPlateNumber}`);
      });
    }
  } catch (error) {
    console.log('❌ Car Search API Proxy failed');
    console.log('Status:', error.response?.status);
    console.log('Error:', error.response?.data || error.message);
  }
}

async function testKaatAPI() {
  console.log('\n=== Testing KAAT API ===');
  try {
    const response = await axios.post(`${BASE_URL}/billing-api/v1/device-event/create`, {
      pID: 'test-123',
      pDeviceNumber: 'DEVICE001',
      pViolation: 36,
      pPlateNumber: 'A123BC777',
      pValidSpeed: 60,
      pActualSpeed: 75,
      pViolationDate: '2025-07-16',
      pViolationTime: '12:00:00',
      pRegion: 'Test Region',
      pDistrict: 'Test District',
      pPlace: 'Test Place',
      pPlaceLatitude: 55.7558,
      pPlaceLongitude: 37.6176,
      pPhoto: '/9j/4AAQSkZJRgABAQEASABIAAD//gATQ3JlYXRlZCB3aXRoIEdJTVD/2wBDAAEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQH/2wBDAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQH/wAARCAAABAAECAYAAACEhIQRAREBAQ=',
      pPhotoPlate: '/9j/4AAQSkZJRgABAQEASABIAAD//gATQ3JlYXRlZCB3aXRoIEdJTVD/2wBDAAEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQH/2wBDAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQH/wAARCAAABAAECAYAAACEhIQRAREBAQ=',
      pPhotoAdditional: '/9j/4AAQSkZJRgABAQEASABIAAD//gATQ3JlYXRlZCB3aXRoIEdJTVD/2wBDAAEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQH/2wBDAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQH/wAARCAAABAAECAYAAACEhIQRAREBAQ=',
      pLink: 'https://example.com/video.mp4'
    }, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer test-kaat-token'
      }
    });

    console.log('✅ KAAT API successful');
    console.log('Status:', response.status);
    console.log('Response:', response.data);
  } catch (error) {
    console.log('❌ KAAT API failed');
    console.log('Status:', error.response?.status);
    console.log('Error:', error.response?.data || error.message);
  }
}

async function testMetrics() {
  console.log('\n=== Testing Metrics ===');
  try {
    const response = await axios.get(`${BASE_URL}/metrics`);
    console.log('✅ Metrics retrieved');
    console.log('Response:', response.data);
  } catch (error) {
    console.log('❌ Metrics failed');
    console.log('Error:', error.response?.data || error.message);
  }
}

async function runAllTests() {
  console.log('🚀 Starting comprehensive tests...');
  console.log('Make sure the server is running on port 3000');
  
  // Проверяем что сервер доступен
  try {
    await axios.get(`${BASE_URL}/metrics`);
    console.log('✅ Server is running');
  } catch (error) {
    console.log('❌ Server is not running. Start with: npm start');
    return;
  }

  // Тест всех функций
  await testLocalUpload();
  await testKaatAPI();
  
  // Тест KAAT proxy функционала
  await testKaatAPIProxy();
  await testCarSearchAPIProxy();
  
  // Тест PLINK proxy функционала
  const token = await testAuth();
  if (token) {
    await testVideoUploadProxy(token);
  }
  
  await testMetrics();

  console.log('\n🏁 All tests completed!');
}

// Запускаем тесты
runAllTests().catch(console.error);
