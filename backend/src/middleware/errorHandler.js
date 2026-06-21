// Catches anything passed to next(err) from controllers, so individual
// route handlers don't need repetitive try/catch error-response logic.
function errorHandler(err, req, res, next) {
    console.error(err);

    // MySQL FK constraint violations - translate to a clean 400 instead
    // of leaking raw SQL error text to the client.
    if (err.code === 'ER_NO_REFERENCED_ROW_2' || err.code === 'ER_NO_REFERENCED_ROW') {
        return res.status(400).json({ error: 'Referenced record does not exist' });
    }

    if (err.code === 'ER_DUP_ENTRY') {
        return res.status(409).json({ error: 'Duplicate entry' });
    }

    res.status(500).json({ error: 'Internal server error' });
}

module.exports = errorHandler;
