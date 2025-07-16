// backend/seed.js

const fs = require('fs');
const csv = require('csv-parser');
const axios = require('axios');

const results = [];
const filePath = './164 BNSS Cases - MP_C CASE.csv';
const apiEndpoint = 'http://localhost:8080/api/cases'; // Updated to port 8080

fs.createReadStream(filePath)
  .pipe(csv())
  .on('data', (data) => {
    if (data['Case No.'] && data['Case No.'].trim() !== '') {
      results.push(data);
    }
  })
  .on('end', async () => {
    console.log(`CSV file successfully processed. Found ${results.length} valid case records.`);
    console.log(`Starting to send data to the API at ${apiEndpoint}`);

    for (const record of results) {
      const payload = {
        case_no: record['Case No.'],
        filing_date: record['filing_date'] || null,
        petitioner: record['Petitioner'],
        respondent: record['Respondent'],
        section: record['section'],
        ps_block: record['PS/BLOCK'],
        next_date: record['next_date'] || null,
        advocate: record['advocate'],
        land_entries: [
          {
            mouza: record['mouza'],
            khatian: record['khatian'],
            jl_no: record['jl_no'],
            dag_no: record['dag_no'],
            area: record['area']
          }
        ]
      };

      try {
        const response = await axios.post(apiEndpoint, payload);
        console.log(`Successfully created case: ${payload.case_no}`);
      } catch (error) {
        console.error(`\n--- Error creating case: ${payload.case_no} ---`);
        if (error.response) {
          console.error('Status:', error.response.status);
          console.error('Data:', error.response.data);
        } else if (error.request) {
          console.error('No response received. The server may be down or crashing.');
        } else {
          console.error('Axios Setup Error:', error.message);
        }
        console.error('-------------------------------------------\n');
      }
    }
     console.log('--- Seeding complete. ---');
  });