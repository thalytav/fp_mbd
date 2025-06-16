const db = require('../config/db');
const { v4: uuidv4 } = require('uuid');

// Mendapatkan semua konselor beserta topiknya
const getKonselors = async (req, res) => {
    try {
        const { userId } = req.query;
        let query = `
            SELECT
                k.NIK,
                k.nama,
                k.spesialisasi,
                k.kontak,
                u.username,
                ARRAY_AGG(t.topik_nama) FILTER (WHERE t.topik_nama IS NOT NULL) AS topik_nama
            FROM Konselor k
            JOIN "User" u ON k.User_user_id = u.user_id
            LEFT JOIN Konselor_Topik kt ON k.NIK = kt.Konselor_NIK
            LEFT JOIN Topik t ON kt.Topik_topik_id = t.topik_id
        `;
        const params = [];

        if (userId) {
            query += ` WHERE u.user_id = $1`;
            params.push(userId);
        }

        query += ` GROUP BY k.NIK, k.nama, k.spesialisasi, k.kontak, u.username ORDER BY k.nama;`;

        const result = await db.query(query, params);
        res.json(result.rows);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Kesalahan server');
    }
};

// Mendapatkan konselor berdasarkan NIK beserta topiknya
const getKonselorByNIK = async (req, res) => {
    const { nik } = req.params;
    try {
        const result = await db.query(`
            SELECT
                k.NIK,
                k.nama,
                k.spesialisasi,
                k.kontak,
                u.username,
                ARRAY_AGG(t.topik_nama) FILTER (WHERE t.topik_nama IS NOT NULL) AS topik_nama
            FROM Konselor k
            JOIN "User" u ON k.User_user_id = u.user_id
            LEFT JOIN Konselor_Topik kt ON k.NIK = kt.Konselor_NIK
            LEFT JOIN Topik t ON kt.Topik_topik_id = t.topik_id
            WHERE k.NIK = $1
            GROUP BY k.NIK, k.nama, k.spesialisasi, k.kontak, u.username;
        `, [nik]);

        if (result.rows.length === 0) {
            return res.status(404).json({ message: 'Konselor tidak ditemukan' });
        }
        res.json(result.rows[0]);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Kesalahan server');
    }
};

// Memperbarui konselor
const updateKonselor = async (req, res) => {
    const { nik } = req.params;
    const { nama, spesialisasi, kontak } = req.body;
    try {
        const result = await db.query(
            'UPDATE Konselor SET nama = $1, spesialisasi = $2, kontak = $3 WHERE NIK = $4 RETURNING NIK',
            [nama, spesialisasi, kontak, nik]
        );
        if (result.rows.length === 0) {
            return res.status(404).json({ message: 'Konselor tidak ditemukan' });
        }
        res.json({ message: 'Konselor berhasil diperbarui', NIK: result.rows[0].nik });
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Kesalahan server');
    }
};

// Menghapus konselor
const deleteKonselor = async (req, res) => {
    const { nik } = req.params; // NIK
    try {
        const konselorUserResult = await db.query('SELECT User_user_id FROM Konselor WHERE NIK = $1', [nik]);
        if (konselorUserResult.rows.length === 0) {
            return res.status(404).json({ message: 'Konselor tidak ditemukan' });
        }
        const userId = konselorUserResult.rows[0].user_user_id;

        const client = await db.pool.connect();
        try {
            await client.query('BEGIN');
            await client.query('DELETE FROM Konselor_Topik WHERE Konselor_NIK = $1', [nik]);
            const relatedSessions = await client.query('SELECT 1 FROM Sesi WHERE Konselor_NIK = $1', [nik]);
            if (relatedSessions.rows.length > 0) {
                throw new Error('Konselor tidak dapat dihapus karena masih terkait dengan sesi.');
            }

            await client.query('DELETE FROM Konselor WHERE NIK = $1', [nik]);
            await client.query('DELETE FROM "User" WHERE user_id = $1', [userId]);

            await client.query('COMMIT');
            res.json({ message: 'Konselor dan pengguna terkait berhasil dihapus' });
        } catch (transactionError) {
            await client.query('ROLLBACK');
            console.error('Error saat menghapus konselor transaksi:', transactionError.message);
            res.status(500).json({ message: `Gagal menghapus konselor: ${transactionError.message}` });
        } finally {
            client.release();
        }
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Kesalahan server');
    }
};

// Menambahkan relasi konselor dan topik
const addKonselorTopik = async (req, res) => {
    const { nik, topik_id } = req.body;
    try {
        await db.query(
            'INSERT INTO Konselor_Topik (Konselor_NIK, Topik_topik_id) VALUES ($1, $2)',
            [nik, topik_id]
        );
        res.status(201).json({ message: 'Topik berhasil ditambahkan ke konselor' });
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Gagal menambahkan topik ke konselor');
    }
};

// Menghapus relasi konselor dan topik
const removeKonselorTopik = async (req, res) => {
    const { nik, topik_id } = req.body;
    try {
        await db.query(
            'DELETE FROM Konselor_Topik WHERE Konselor_NIK = $1 AND Topik_topik_id = $2',
            [nik, topik_id]
        );
        res.json({ message: 'Topik berhasil dihapus dari konselor' });
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Gagal menghapus topik dari konselor');
    }
};

module.exports = {
    getKonselors,
    getKonselorByNIK,
    updateKonselor,
    deleteKonselor,
    addKonselorTopik,
    removeKonselorTopik,
};
