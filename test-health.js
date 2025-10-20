const { checkDatabaseHealth, checkRedisHealth, checkSecurityHealth, checkScraperStatus } = require('./utils/health-checkers');

async function testHealthChecks() {
  console.log('Testing Health Monitoring...\n');

  try {
    console.log('1. Database Health:');
    const dbHealth = await checkDatabaseHealth();
    console.log(JSON.stringify(dbHealth, null, 2));

    console.log('\n2. Redis Health:');
    const redisHealth = await checkRedisHealth();
    console.log(JSON.stringify(redisHealth, null, 2));

    console.log('\n3. Security Health:');
    const securityHealth = await checkSecurityHealth();
    console.log(JSON.stringify(securityHealth, null, 2));

    console.log('\n4. Scraper Status:');
    const scraperHealth = await checkScraperStatus();
    console.log(JSON.stringify(scraperHealth, null, 2));

  } catch (error) {
    console.error('Test failed:', error.message);
  }
}

testHealthChecks();