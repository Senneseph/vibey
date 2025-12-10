import { SearchService } from '../agent/search/search_service';
import { VectorDatabase } from '../agent/vectorization';

// Simple test to verify search functionality
async function testSearchFunctionality() {
  console.log('Testing Search Functionality...');
  
  try {
    // Test VectorDatabase
    const vectorDB = new VectorDatabase();
    console.log('VectorDatabase created successfully');
    
    // Test adding a document
    await vectorDB.addDocument('test_doc_1', 'This is a test document for vectorization');
    console.log('Document added successfully');
    
    // Test searching
    const results = await vectorDB.search('test', 5);
    console.log('Search results:', results);
    
    // Test SearchService
    const searchService = new SearchService();
    console.log('SearchService created successfully');
    
    console.log('Search functionality test completed successfully');
  } catch (error) {
    console.error('Search functionality test failed:', error);
    throw error;
  }
}

// Run the test
if (require.main === module) {
  testSearchFunctionality().catch(console.error);
}
