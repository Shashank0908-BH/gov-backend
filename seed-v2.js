import fs from 'fs';
import csv from 'csv-parser';
import axios from 'axios';

// This function attempts to split a full name into first and last name.
// It's a simple helper and may not be perfect for all cases.
const splitName = (fullName) => {
    if (!fullName || typeof fullName !== 'string') {
        return { first_name: '', last_name: '' };
    }
    const parts = fullName.trim().split(' ');
    if (parts.length === 1) {
        return { first_name: parts[0], last_name: '' };
    }
    const first_name = parts.slice(0, -1).join(' ');
    const last_name = parts[parts.length - 1];
    return { first_name, last_name };
};

const importData = async () => {
    const results = [];
    const filePath = './164 BNSS Cases - MP_C CASE.csv';
    const apiEndpoint = 'http://localhost:8080/api/cases';

    // First, create the admin user to ensure authenticated requests can be made if needed.
    // In our current setup, the createCase endpoint is protected.
    try {
        console.log('Ensuring admin user exists...');
        await axios.post('http://localhost:8080/api/users/register', {
            username: 'admin',
            password: 'password123',
            role: 'Admin'
        });
        console.log('Admin user exists or was created.');
    } catch (error) {
        // It's okay if the user already exists (400 error). Any other error is a problem.
        if (error.response && error.response.status !== 400) {
            console.error('Could not create admin user. Halting script.', error.response.data);
            return;
        }
        console.log('Admin user already exists.');
    }

    // Now, log in as the admin user to get a token for creating cases.
    let token = '';
    try {
        console.log('Logging in as admin...');
        const loginResponse = await axios.post('http://localhost:8080/api/users/login', {
            username: 'admin',
            password: 'password123'
        });
        token = loginResponse.data.token;
        console.log('Login successful.');
    } catch (error) {
        console.error('Could not log in as admin. Halting script.', error.response.data);
        return;
    }

    const config = {
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
        },
    };

    fs.createReadStream(filePath)
        .pipe(csv())
        .on('data', (data) => {
            // Only process rows that have a valid Case No.
            if (data['Case No.'] && data['Case No.'].trim() !== '') {
                results.push(data);
            }
        })
        .on('end', async () => {
            console.log(`\nCSV file processed. Found ${results.length} valid case records to import.`);
            console.log('Starting import process...\n');

            for (const record of results) {
                const petitionerName = splitName(record['Petitioner']);
                const respondentName = splitName(record['Respondent']);
                const advocateName = splitName(record['advocate']);

                const payload = {
                    case_no: record['Case No.'],
                    filing_date: record['filing_date'] || null,
                    section: record['section'],
                    ps_block: record['PS/BLOCK'],
                    petitioners: [
                        {
                            ...petitionerName,
                            advocates: [advocateName] // Assign the advocate to the petitioner
                        }
                    ],
                    respondents: [
                        respondentName
                    ],
                    land_entries: [
                        {
                            mouza: record['mouza'],
                            khatian_no: record['khatian'],
                            jl_no: record['jl_no'],
                            dag_no: record['dag_no'],
                            area: record['area']
                        }
                    ],
                    hearing_dates: [
                        { hearing_date: record['next_date'] || null, purpose_of_hearing: 'Next Hearing' }
                    ]
                };

                try {
                    await axios.post(apiEndpoint, payload, config);
                    console.log(`SUCCESS: Imported Case No. ${payload.case_no}`);
                } catch (error) {
                    const errorMessage = error.response ? JSON.stringify(error.response.data) : error.message;
                    console.error(`FAILED to import Case No. ${payload.case_no}. Reason: ${errorMessage}`);
                }
            }
            console.log('\nImport process complete.');
        });
};

importData();
