import pool from '../config/db.js';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';

// Helper function to find or create a party record.
const findOrCreateParty = async (client, party) => {
    if (!party || !party.first_name) return null;
    if (party.email || party.mobile_no) {
        const existing = await client.query('SELECT id FROM parties WHERE email = $1 OR mobile_no = $2', [party.email || null, party.mobile_no || null]);
        if (existing.rows.length > 0) return existing.rows[0].id;
    }
    const newParty = await client.query('INSERT INTO parties (first_name, last_name, address, city, state, pincode, police_station, email, mobile_no) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id', [party.first_name, party.last_name, party.address, party.city, party.state, party.pincode, party.police_station, party.email, party.mobile_no]);
    return newParty.rows[0].id;
};

// @desc    Create a new case
export const createCase = async (req, res) => {
    const { case_no, filing_date, section, ps_block, petitioners, respondents, land_entries, hearing_dates } = req.body;
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const caseResult = await client.query('INSERT INTO cases (case_no, filing_date, section, ps_block) VALUES ($1, $2, $3, $4) RETURNING id', [case_no, filing_date, section, ps_block]);
        const caseId = caseResult.rows[0].id;

        if (petitioners) {
            for (const petitioner of petitioners) {
                const partyId = await findOrCreateParty(client, petitioner);
                if (partyId) {
                    await client.query('INSERT INTO case_parties (case_id, party_id, party_role) VALUES ($1, $2, $3)', [caseId, partyId, 'Petitioner']);
                    if (petitioner.advocates) {
                        for (const advocate of petitioner.advocates) {
                            const advocateId = await findOrCreateParty(client, advocate);
                            if (advocateId) await client.query('INSERT INTO case_party_advocates (case_id, party_id, party_role, advocate_id) VALUES ($1, $2, $3, $4)', [caseId, partyId, 'Petitioner', advocateId]);
                        }
                    }
                }
            }
        }
        if (respondents) {
            for (const respondent of respondents) {
                const partyId = await findOrCreateParty(client, respondent);
                if (partyId) {
                    await client.query('INSERT INTO case_parties (case_id, party_id, party_role) VALUES ($1, $2, $3)', [caseId, partyId, 'Respondent']);
                    if (respondent.advocates) {
                        for (const advocate of respondent.advocates) {
                            const advocateId = await findOrCreateParty(client, advocate);
                            if (advocateId) await client.query('INSERT INTO case_party_advocates (case_id, party_id, party_role, advocate_id) VALUES ($1, $2, $3, $4)', [caseId, partyId, 'Respondent', advocateId]);
                        }
                    }
                }
            }
        }
        await client.query('COMMIT');
        res.status(201).json({ message: 'Case created successfully', caseId });
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Error creating case:', error);
        res.status(500).json({ message: 'Server error during case creation.' });
    } finally {
        client.release();
    }
};

// @desc    Get all cases with nested advocate data
export const getAllCases = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const offset = (page - 1) * limit;

        const totalResult = await pool.query('SELECT COUNT(*) FROM cases');
        const totalCases = parseInt(totalResult.rows[0].count, 10);
        const totalPages = Math.ceil(totalCases / limit);

        // This final query correctly joins and aggregates all parties and their specific advocates
        const dataQuery = `
            SELECT
                c.id,
                c.case_no,
                c.filing_date,
                (
                    SELECT json_agg(pet_info) FROM (
                        SELECT
                            p.first_name, p.last_name,
                            (
                                SELECT json_agg(adv_info) FROM (
                                    SELECT adv.first_name, adv.last_name
                                    FROM case_party_advocates cpa
                                    JOIN parties adv ON cpa.advocate_id = adv.id
                                    WHERE cpa.case_id = cp.case_id AND cpa.party_id = cp.party_id
                                ) AS adv_info
                            ) as advocates
                        FROM case_parties cp
                        JOIN parties p ON cp.party_id = p.id
                        WHERE cp.case_id = c.id AND cp.party_role = 'Petitioner'
                    ) AS pet_info
                ) as petitioners,
                (
                    SELECT json_agg(res_info) FROM (
                        SELECT
                            p.first_name, p.last_name,
                            (
                                SELECT json_agg(adv_info) FROM (
                                    SELECT adv.first_name, adv.last_name
                                    FROM case_party_advocates cpa
                                    JOIN parties adv ON cpa.advocate_id = adv.id
                                    WHERE cpa.case_id = cp.case_id AND cpa.party_id = cp.party_id
                                ) AS adv_info
                            ) as advocates
                        FROM case_parties cp
                        JOIN parties p ON cp.party_id = p.id
                        WHERE cp.case_id = c.id AND cp.party_role = 'Respondent'
                    ) AS res_info
                ) as respondents
            FROM cases c
            GROUP BY c.id
            ORDER BY c.filing_date DESC NULLS LAST
            LIMIT $1 OFFSET $2;
        `;
        const { rows: cases } = await pool.query(dataQuery, [limit, offset]);
        res.status(200).json({ cases, totalPages, currentPage: page });
    } catch (error) {
        console.error('Error fetching cases:', error);
        res.status(500).json({ message: 'Server error' });
    }
};

// @desc    Get a single case by ID
export const getCaseById = async (req, res) => {
    const { id } = req.params;
    try {
        const caseResult = await pool.query('SELECT * FROM cases WHERE id = $1', [id]);
        if (caseResult.rows.length === 0) return res.status(404).json({ message: 'Case not found' });
        const caseData = caseResult.rows[0];

        const partiesResult = await pool.query(`
            SELECT p.*, cp.party_role,
                   (SELECT json_agg(adv_info) FROM (
                       SELECT adv.first_name, adv.last_name
                       FROM case_party_advocates cpa
                       JOIN parties adv ON cpa.advocate_id = adv.id
                       WHERE cpa.case_id = cp.case_id AND cpa.party_id = cp.party_id AND cpa.party_role = cp.party_role
                   ) AS adv_info) as advocates
            FROM case_parties cp
            JOIN parties p ON cp.party_id = p.id
            WHERE cp.case_id = $1
        `, [id]);

        caseData.petitioners = partiesResult.rows.filter(p => p.party_role === 'Petitioner');
        caseData.respondents = partiesResult.rows.filter(p => p.party_role === 'Respondent');
        
        const landEntriesResult = await pool.query('SELECT * FROM land_entries WHERE case_id = $1', [id]);
        caseData.land_entries = landEntriesResult.rows;

        const hearingDatesResult = await pool.query('SELECT * FROM hearing_dates WHERE case_id = $1 ORDER BY hearing_date DESC', [id]);
        caseData.hearing_dates = hearingDatesResult.rows;

        res.status(200).json(caseData);
    } catch (error) {
        console.error('Error fetching case by ID:', error);
        res.status(500).json({ message: 'Server error' });
    }
};

// @desc    Update a case
export const updateCase = async (req, res) => {
    const { id } = req.params;
    const { case_no, filing_date, section, ps_block, petitioners, respondents } = req.body;
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        await client.query('UPDATE cases SET case_no = $1, filing_date = $2, section = $3, ps_block = $4, updated_at = CURRENT_TIMESTAMP WHERE id = $5', [case_no, filing_date, section, ps_block, id]);
        
        // Clear old associations
        await client.query('DELETE FROM case_party_advocates WHERE case_id = $1', [id]);
        await client.query('DELETE FROM case_parties WHERE case_id = $1', [id]);
        
        // Re-create associations
        if (petitioners) {
            for (const petitioner of petitioners) {
                const partyId = await findOrCreateParty(client, petitioner);
                if (partyId) {
                    await client.query('INSERT INTO case_parties (case_id, party_id, party_role) VALUES ($1, $2, $3)', [id, partyId, 'Petitioner']);
                    if (petitioner.advocates) {
                        for (const advocate of petitioner.advocates) {
                            const advocateId = await findOrCreateParty(client, advocate);
                            if (advocateId) await client.query('INSERT INTO case_party_advocates (case_id, party_id, party_role, advocate_id) VALUES ($1, $2, $3, $4)', [id, partyId, 'Petitioner', advocateId]);
                        }
                    }
                }
            }
        }
        if (respondents) {
            for (const respondent of respondents) {
                const partyId = await findOrCreateParty(client, respondent);
                if (partyId) {
                    await client.query('INSERT INTO case_parties (case_id, party_id, party_role) VALUES ($1, $2, $3)', [id, partyId, 'Respondent']);
                    if (respondent.advocates) {
                        for (const advocate of respondent.advocates) {
                            const advocateId = await findOrCreateParty(client, advocate);
                            if (advocateId) await client.query('INSERT INTO case_party_advocates (case_id, party_id, party_role, advocate_id) VALUES ($1, $2, $3, $4)', [id, partyId, 'Respondent', advocateId]);
                        }
                    }
                }
            }
        }
        await client.query('COMMIT');
        res.status(200).json({ message: 'Case updated successfully' });
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Error updating case:', error);
        res.status(500).json({ message: 'Server error during case update.' });
    } finally {
        client.release();
    }
};

// @desc    Delete a case
export const deleteCase = async (req, res) => {
    try {
        const { id } = req.params;
        const deleteResult = await pool.query('DELETE FROM cases WHERE id = $1', [id]);
        if (deleteResult.rowCount === 0) return res.status(404).json({ message: 'Case not found' });
        res.status(200).json({ message: 'Case deleted successfully' });
    } catch (error) {
        console.error('Error deleting case:', error);
        res.status(500).json({ message: 'Server error' });
    }
};

// @desc    Generate a PDF for a single case
export const generateCasePdf = async (req, res) => {
    const { id } = req.params;
    try {
        // Reuse the logic from getCaseById to fetch all data
        const caseResult = await pool.query('SELECT * FROM cases WHERE id = $1', [id]);
        if (caseResult.rows.length === 0) return res.status(404).json({ message: 'Case not found' });
        const caseData = caseResult.rows[0];
        
        // Fetch parties and advocates
        const partiesResult = await pool.query(`
            SELECT p.first_name, p.last_name, cp.party_role, 
                   (SELECT json_agg(adv_info) FROM (
                       SELECT adv.first_name as adv_fn, adv.last_name as adv_ln
                       FROM case_party_advocates cpa JOIN parties adv ON cpa.advocate_id = adv.id
                       WHERE cpa.case_id = cp.case_id AND cpa.party_id = cp.party_id AND cpa.party_role = cp.party_role
                   ) AS adv_info) as advocates
            FROM case_parties cp JOIN parties p ON cp.party_id = p.id
            WHERE cp.case_id = $1
        `, [id]);
        
        const petitioners = partiesResult.rows.filter(p => p.party_role === 'Petitioner');
        const respondents = partiesResult.rows.filter(p => p.party_role === 'Respondent');

        const pdfDoc = await PDFDocument.create();
        let page = pdfDoc.addPage();
        const { height } = page.getSize();
        const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
        const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
        let y = height - 50;

        const drawText = (text, x, yPos, f = font, size = 11) => {
            if (yPos < 40) { page = pdfDoc.addPage(); yPos = height - 50; }
            page.drawText(text, { x, y: yPos, font: f, size, color: rgb(0, 0, 0) });
            return yPos - (size + 5);
        };
        
        y = drawText(`Case Summary: ${caseData.case_no}`, 50, y, boldFont, 18);
        y -= 15;
        y = drawText(`Filing Date: ${caseData.filing_date ? new Date(caseData.filing_date).toLocaleDateString() : 'N/A'}`, 50, y);
        y -= 15;

        y = drawText(`Petitioner(s)`, 50, y, boldFont, 14);
        petitioners.forEach(p => {
            y = drawText(`  - ${p.first_name || ''} ${p.last_name || ''}`, 55, y);
            const advNames = p.advocates?.map(a => `${a.adv_fn} ${a.adv_ln || ''}`.trim()).join(', ') || 'N/A';
            y = drawText(`    Advocate(s): ${advNames}`, 60, y, font, 9);
        });
        y -= 15;

        y = drawText(`Respondent(s)`, 50, y, boldFont, 14);
        respondents.forEach(p => {
            y = drawText(`  - ${p.first_name || ''} ${p.last_name || ''}`, 55, y);
            const advNames = p.advocates?.map(a => `${a.adv_fn} ${a.adv_ln || ''}`.trim()).join(', ') || 'N/A';
            y = drawText(`    Advocate(s): ${advNames}`, 60, y, font, 9);
        });

        const pdfBytes = await pdfDoc.save();
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="case_${caseData.case_no.replace('/', '_')}.pdf"`);
        res.send(Buffer.from(pdfBytes));
    } catch (error) {
        console.error('Error generating PDF:', error);
        res.status(500).json({ message: 'Server error while generating PDF' });
    }
};


//After you replace the code in this file and restart your backend server, all your API endpoints will be fully functional and aligned with the final database schema. The next step is to update the frontend forms to mat