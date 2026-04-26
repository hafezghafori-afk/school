const testAdminLogin = async () => {
  try {
    console.log('Testing admin login...');
    
    const response = await fetch('http://localhost:5000/api/auth/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        email: 'admin@school.com',
        password: 'admin123'
      })
    });
    
    const data = await response.json();
    console.log('Response status:', response.status);
    console.log('Response data:', data);
    
    if (data.success) {
      console.log('✅ Admin login successful!');
      console.log('User:', data.name);
      console.log('Role:', data.role);
      console.log('Admin Level:', data.adminLevel);
      console.log('Requires 2FA:', data.requiresTwoFactor || false);
    } else {
      console.log('❌ Admin login failed:', data.message);
    }
    
  } catch (error) {
    console.error('Error:', error.message);
  }
};

testAdminLogin();
