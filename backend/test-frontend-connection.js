const testConnection = async () => {
  try {
    // Test direct API connection
    console.log('Testing direct API connection...');
    const response = await fetch('http://localhost:5000/api/health');
    const data = await response.json();
    console.log('Health check:', data);
    
    // Test login endpoint
    console.log('\nTesting login endpoint...');
    const loginResponse = await fetch('http://localhost:5000/api/auth/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        email: 'test@example.com',
        password: 'test123'
      })
    });
    
    const loginData = await loginResponse.json();
    console.log('Login response:', loginData);
    
  } catch (error) {
    console.error('Connection error:', error.message);
  }
};

testConnection();
