console.log('Testing search module imports...');

try {
  // Test importing the search modules
  const searchModule = require('./dist/extension.js');
  console.log('✓ Extension module imported successfully');
  
  // Test importing individual modules
  const vectorization = require('./dist/agent/vectorization.js');
  console.log('✓ Vectorization module imported successfully');
  
  const searchService = require('./dist/agent/search/search_service.js');
  console.log('✓ Search service module imported successfully');
  
  console.log('All modules imported successfully!');
} catch (error) {
  console.error('Error importing modules:', error);
  process.exit(1);
}