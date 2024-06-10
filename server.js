require('dotenv').config();
const express = require("express");
const mysql = require("mysql");
const { body, validationResult } = require('express-validator');
const bcrypt = require('bcryptjs');
const session = require('express-session');
const flash = require('connect-flash');
const bodyParser = require('body-parser');
const path = require('path');
const nodemailer = require('nodemailer');
const pdf = require('html-pdf');


const app = express();
const port = process.env.PORT || 5001;

// Middleware to parse JSON and form data
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(session({
    secret: 'secret',
    saveUninitialized: true,
    resave: false,
    cookie: { secure: false }
}));

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.use(flash());

// MySQL connection
const db = mysql.createConnection({
    host: "localhost",
    user: "root",
    password: "",
    database: "aira",
});

db.connect((err) => {
    if (err) {
        throw err;
    }
    console.log("MySQL connected...");
});

app.use((req, res, next) => {
    res.locals.messages = req.flash();
    next();
});

// Function to check if the user is authenticated
function checkAuthenticated(req, res, next) {
    if (req.session.userId) {
        return next();
    }
    req.flash('error', 'You must be logged in to view this page.');
    res.redirect('/login');
}
// Routes
app.get('/homepage', checkAuthenticated, (req, res) => {
    const userId = req.session.userId;
    db.query('SELECT * FROM user WHERE UserID = ?', [userId], (err, results) => {
        if (err) {
            console.error('Database error:', err);
            req.flash('error', 'Internal Server Error');
            return res.redirect('/login');
        }
        if (results.length > 0) {
            const user = results[0];
            res.render('homepage', {
                name: user.firstname,
                successMessage: req.flash('success')[0],
                errorMessage: req.flash('error')[0]
            });
        } else {
            req.flash('error', 'User not found.');
            res.redirect('/login');
        }
    });
});

app.get('/login', (req, res) => {
    const errorMessages = req.flash('error');
    const successMessages = req.flash('success');
    res.render('login', {
        errorMessages: errorMessages,
        successMessages: successMessages
    });
});

app.get('/register', (req, res) => {
    const errorMessages = req.flash('error');
    const successMessages = req.flash('success');
    res.render('register', {
        errorMessages: errorMessages,
        successMessages: successMessages
    });
});

app.post('/register', [
    body('email', 'Invalid email').isEmail(),
    body('password', 'Password must be at least 5 characters long').isLength({ min: 5 }),
    body('confirmPassword', 'Passwords do not match').custom((value, { req }) => value === req.body.password)
], (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        req.flash('error', errors.array().map(err => err.msg).join(', '));
        return res.redirect('/register');
    }

    const { firstname, surname, email, password } = req.body;
    const hashedPassword = bcrypt.hashSync(password, 8);

    db.query('INSERT INTO user (firstname, surname, email, password) VALUES (?, ?, ?, ?)',
        [firstname, surname, email, hashedPassword], (err, results) => {
            if (err) {
                console.error('Error inserting into the database', err);
                req.flash('error', 'Error registering user');
                res.redirect('/register');
            } else {
                req.flash('success', 'Registration successful!');
                res.redirect('/login');
            }
        });
});

app.post('/login', async (req, res) => {
    const { email, password } = req.body;

    db.query('SELECT * FROM user WHERE email = ?', [email], async (err, results) => {
        if (err) {
            console.error('Database error during login:', err);
            req.flash('error', 'Internal Server Error');
            res.redirect('/login');
        } else if (results.length > 0) {
            const comparisonResult = await bcrypt.compare(password, results[0].password);
            if (comparisonResult) {
                req.session.userId = results[0].UserID;
                req.flash('success', 'Login successful!');
                res.redirect('/homepage');
            } else {
                req.flash('error', 'Incorrect password.');
                res.redirect('/login');
            }
        } else {
            req.flash('error', 'Email not found.');
            res.redirect('/login');
        }
    });
});

app.get('/logout', (req, res) => {
    req.session.destroy(err => {
        if (err) {
            return console.error('Logout Failed', err);
        }
        res.redirect('/login');
    });
});

// Route for selecting a course
app.get('/select-course', checkAuthenticated, (req, res) => {
    res.render('select-course');
});

// Route for selecting subjects based on the course selected
app.get('/select-subject/:course', checkAuthenticated, (req, res) => {
    const course = req.params.course;
    res.render(`select-subject-${course}`);
});

// Route for selecting topics based on the subject selected
app.get('/select-topic/:course/:subject', checkAuthenticated, (req, res) => {
    const course = req.params.course;
    const subject = req.params.subject;

    if (subject === 'Engineering Math') {
        res.render('engineering-math-topics', { course, subject });
    } else if (subject === 'Engineering Science') {
        res.render('engineering-science-topics', { course, subject });
    } else if (subject === 'Professional Subjects') {
        res.render('professional-subject-topics', { course, subject });
    } else {
        db.query('SELECT * FROM Topics WHERE Subject = ?', [subject], (err, results) => {
            if (err) {
                console.error('Error fetching topics:', err);
                req.flash('error', 'Error fetching topics');
                return res.redirect('/select-course');
            }
            res.render('select-topic', { course, subject, topics: results });
        });
    }
});



// Route to handle fetching topics for specific subjects
app.get('/topics/algebra', checkAuthenticated, (req, res) => {
    const subject = 'Algebra';
    const course = 'Engineering Mathematics'; // You can adjust this as needed

    res.render('select-question-type', {
        course,
        subject
    });
});




// Route to handle selecting the exam method for multiple-choice questions
app.get('/topics/algebra/multiple-choice', checkAuthenticated, (req, res) => {
    const subject = 'Algebra';
    const course = 'Engineering Mathematics'; // Adjust as needed

    res.render('select-exam-method', {
        course,
        subject,
        questionType: 'Multiple Choice'
    });
});


app.get('/take-exam-web/multiple-choice/algebra', checkAuthenticated, (req, res) => {
    const topicId = 1; // Algebra topic ID

    // Fetch 10 random questions for the specified topic
    const query = `
        SELECT id, question, option_a, option_b, option_c, option_d, correct_option
        FROM algebra_multiple_choice_questions
        WHERE topic_id = ?
        ORDER BY RAND()
        LIMIT 10
    `;

    db.query(query, [topicId], (err, results) => {
        if (err) {
            console.error('Error fetching questions:', err);
            return res.status(500).send('Error fetching questions');
        }

        // Store the questions in the session
        req.session.questions = results;

        // Render the exam form with questions and topicId
        res.render('exam-form', {
            topicId: topicId,
            questions: results
        });
    });
});







// Route to handle selecting the exam method for computational questions
app.get('/topics/algebra/computational', checkAuthenticated, (req, res) => {
    const subject = 'Algebra';
    const course = 'Engineering Mathematics'; // Adjust as needed

    res.render('select-exam-computational-method', {
        course,
        subject,
        questionType: 'Computational'
    });
});

app.get('/take-exam-web/computational/algebra', checkAuthenticated, (req, res) => {
    const topicId = 12; // Algebra Computational topic ID

    // Fetch 10 random questions for the specified topic
    const query = `
        SELECT id, question, answer
        FROM algebra_computational_questions
        WHERE topic_id = ?
        ORDER BY RAND()
        LIMIT 10
    `;

    db.query(query, [topicId], (err, results) => {
        if (err) {
            console.error('Error fetching questions:', err);
            return res.status(500).send('Error fetching questions');
        }

        // Store the questions in the session
        req.session.questions = results;

        // Render the exam form with questions and topicId
        res.render('exam-form-algebra-computational', {
            topicId: topicId,
            questions: results
        });
    });
});


//calculus//

// Route to handle fetching topics for differential calculus
app.get('/topics/differential-calculus', checkAuthenticated, (req, res) => {
    const subject = 'Differential Calculus';
    const course = 'Engineering Mathematics'; // You can adjust this as needed

    res.render('select-question-type-differential-calculus', {
        course,
        subject
    });
});

// Route to handle selecting the exam method for differential calculus multiple-choice questions
app.get('/topics/differential-calculus/multiple-choice', checkAuthenticated, (req, res) => {
    const subject = 'Differential Calculus';
    const course = 'Engineering Mathematics'; // Adjust as needed

    res.render('select-exam-method-differential-calculus', {
        course,
        subject,
        questionType: 'Multiple Choice'
    });
});

app.get('/take-exam-web/multiple-choice/differential-calculus', checkAuthenticated, (req, res) => {
    const topicId = 2; // Differential Calculus topic ID

    // Fetch 10 random questions for the specified topic
    const query = `
        SELECT id, question, option_a, option_b, option_c, option_d, correct_option
        FROM differential_calculus_questions
        WHERE topic_id = ?
        ORDER BY RAND()
        LIMIT 10
    `;

    db.query(query, [topicId], (err, results) => {
        if (err) {
            console.error('Error fetching questions:', err);
            return res.status(500).send('Error fetching questions');
        }

        // Store the questions in the session
        req.session.questions = results;

        // Render the exam form with questions and topicId
        res.render('exam-form-differential-calculus', {
            topicId: topicId,
            questions: results
        });
    });
});


app.get('/topics/differential-calculus/computational', checkAuthenticated, (req, res) => {
    const subject = 'Differential Calculus';
    const course = 'Engineering Mathematics'; // Adjust as needed

    res.render('select-exam-computational-method-differential', {
        course,
        subject,
        questionType: 'Computational'
    });
});

app.get('/take-exam-web/computational/differential-calculus', checkAuthenticated, (req, res) => {
    const subject = 'Differential Calculus';
    const topicId = 15; // Differential Calculus topic ID

    // Fetch 10 random questions for the specified topic
    const questionQuery = `
        SELECT id, question, answer
        FROM differential_calculus_computational_questions
        WHERE topic_id = ?
        ORDER BY RAND()
        LIMIT 10
    `;

    db.query(questionQuery, [topicId], (err, results) => {
        if (err) {
            console.error('Error fetching questions:', err);
            return res.status(500).send('Error fetching questions');
        }

        // Store the questions in the session
        req.session.questions = results;

        // Render the exam form with questions and topicId
        res.render('exam-form-differential-computational', {
            topicId: topicId,
            questions: results
        });
    });
});





//integral-calculus//

// Route to handle fetching topics for integral calculus
app.get('/topics/integral-calculus', checkAuthenticated, (req, res) => {
    const subject = 'Integral Calculus';
    const course = 'Engineering Mathematics'; // You can adjust this as needed

    res.render('select-question-type-integral-calculus', {
        course,
        subject
    });
});

// Endpoint to handle fetching questions for integral calculus
app.get('/topics/integral-calculus/multiple-choice', checkAuthenticated, (req, res) => {
    const subject = 'Integral Calculus';
    const course = 'Engineering Mathematics'; // Adjust as needed

    res.render('select-exam-method-integral-calculus', {
        course,
        subject,
        questionType: 'Multiple Choice'
    });
});


app.get('/take-exam-web/multiple-choice/integral-calculus', checkAuthenticated, (req, res) => {
    const topicId = 3; // Integral Calculus topic ID

    // Fetch 10 random questions for the specified topic
    const query = `
        SELECT id, question, option_a, option_b, option_c, option_d, correct_option
        FROM integral_calculus_questions
        WHERE topic_id = ?
        ORDER BY RAND()
        LIMIT 10
    `;

    db.query(query, [topicId], (err, results) => {
        if (err) {
            console.error('Error fetching questions:', err);
            return res.status(500).send('Error fetching questions');
        }

        // Store the questions in the session
        req.session.questions = results;

        // Render the exam form with questions and topicId
        res.render('exam-form-integral-calculus', {
            topicId: topicId,
            questions: results
        });
    });
});

app.get('/topics/integral-calculus/computational', checkAuthenticated, (req, res) => {
    const subject = 'Integral Calculus';
    const course = 'Engineering Mathematics'; // Adjust as needed

    res.render('select-exam-computational-method-integral', {
        course,
        subject,
        questionType: 'Computational'
    });
});

app.get('/take-exam-web/computational/integral-calculus', checkAuthenticated, (req, res) => {
    const subject = 'Integral Calculus';
    const topicId = 16; // Integral Calculus topic ID

    // Fetch 10 random questions for the specified topic
    const questionQuery = `
        SELECT id, question, answer
        FROM integral_calculus_computational_questions
        WHERE topic_id = ?
        ORDER BY RAND()
        LIMIT 10
    `;

    db.query(questionQuery, [topicId], (err, results) => {
        if (err) {
            console.error('Error fetching questions:', err);
            return res.status(500).send('Error fetching questions');
        }

        // Store the questions in the session
        req.session.questions = results;

        // Render the exam form with questions and topicId
        res.render('exam-form-integral-computational', {
            topicId: topicId,
            questions: results
        });
    });
});

app.get('/topics/plane-and-solid-geometry/computational', checkAuthenticated, (req, res) => {
    const subject = 'Plane and Solid Geomtry';
    const course = 'Engineering Mathematics'; // Adjust as needed

    res.render('select-exam-computational-method-plane-and-solid-geometry', {
        course,
        subject,
        questionType: 'Computational'
    });
});

app.get('/take-exam-web/computational/plane-and-solid-geometry', checkAuthenticated, (req, res) => {
    const subject = 'Plane and Solid Geometry';
    const topicId = 34; // Differential Calculus topic ID

    // Fetch 10 random questions for the specified topic
    const questionQuery = `
        SELECT id, question, answer
        FROM plane_solid_geometry_computational_questions
        WHERE topic_id = ?
        ORDER BY RAND()
        LIMIT 10
    `;

    db.query(questionQuery, [topicId], (err, results) => {
        if (err) {
            console.error('Error fetching questions:', err);
            return res.status(500).send('Error fetching questions');
        }

        // Store the questions in the session
        req.session.questions = results;

        // Render the exam form with questions and topicId
        res.render('exam-form-plane-and-solid-geometry-computational', {
            topicId: topicId,
            questions: results
        });
    });
});


//physics//

// Route to handle fetching topics for physics
app.get('/topics/physics', checkAuthenticated, (req, res) => {
    const subject = 'Physics';
    const course = 'Engineering Science'; // You can adjust this as needed

    res.render('select-question-type-physics', {
        course,
        subject
    });
});

// Route to handle selecting the exam method for physics multiple-choice questions
app.get('/topics/physics/multiple-choice', checkAuthenticated, (req, res) => {
    const subject = 'Physics';
    const course = 'Engineering Science'; // Adjust as needed

    res.render('select-exam-method-physics', {
        course,
        subject,
        questionType: 'Multiple Choice'
    });
});

app.get('/take-exam-web/multiple-choice/physics', checkAuthenticated, (req, res) => {
    const topicId = 4; // Physics topic ID

    // Fetch 10 random questions for the specified topic
    const query = `
        SELECT id, question, option_a, option_b, option_c, option_d, correct_option
        FROM physics_multiple_choice_questions
        WHERE topic_id = ?
        ORDER BY RAND()
        LIMIT 10
    `;

    db.query(query, [topicId], (err, results) => {
        if (err) {
            console.error('Error fetching questions:', err);
            return res.status(500).send('Error fetching questions');
        }

        // Store the questions in the session
        req.session.questions = results;

        // Render the exam form with questions and topicId
        res.render('exam-form-physics', {
            topicId: topicId,
            questions: results
        });
    });
});



app.get('/topics/chemistry', checkAuthenticated, (req, res) => {
    const subject = 'Chemistry';
    const course = 'Engineering Science and Allied Subjects'; // You can adjust this as needed

    res.render('select-question-type-chemistry', {
        course,
        subject
    });
});

app.get('/topics/chemistry/multiple-choice', checkAuthenticated, (req, res) => {
    const subject = 'Chemistry';
    const course = 'Engineering Science and Allied Subjects'; // You can adjust this as needed

    res.render('select-exam-method-chemistry', {
        course,
        subject
    });
});

app.get('/take-exam-web/multiple-choice/chemistry', checkAuthenticated, (req, res) => {
    const topicId = 33; // Fluid Mechanics topic ID

    // Fetch 10 random questions for the specified topic
    const query = `
        SELECT id, question, option_a, option_b, option_c, option_d, correct_option
        FROM chemistry_multiple_choice_questions
        WHERE topic_id = ?
        ORDER BY RAND()
        LIMIT 10
    `;

    db.query(query, [topicId], (err, results) => {
        if (err) {
            console.error('Error fetching questions:', err);
            return res.status(500).send('Error fetching questions');
        }

        // Store the questions in the session
        req.session.questions = results;

        // Render the exam form with questions and topicId
        res.render('exam-form-chemistry', {
            topicId: topicId,
            questions: results
        });
    });
});

// Route to display assessment results
app.get('/assessment', checkAuthenticated, async (req, res) => {
    const userId = req.session.userId;

    console.log('User ID from session:', userId);

    if (!userId) {
        return res.status(401).send('User not authenticated');
    }

    const query = `
        SELECT a.topic_id, t.topicName, a.Score, a.TotalQuestions, a.CreatedAt
        FROM assessments a
        JOIN topics t ON a.topic_id = t.topic_id
        WHERE a.UserID = ?
        ORDER BY a.CreatedAt DESC;
    `;

    db.query(query, [userId], (err, results) => {
        if (err) {
            console.error('Error retrieving assessments:', err);
            return res.status(500).send('Failed to retrieve assessments');
        }

        console.log('Query results:', results);

        if (results.length > 0) {
            res.render('assessment', { assessments: results });
        } else {
            res.render('assessment', { assessments: [] });
        }
    });
});




// Route for topics
app.get('/topic-course', checkAuthenticated, (req, res) => {
    res.render('select-topic-course');
});

app.get('/topic-BSCPE', checkAuthenticated, (req, res) => {
    res.render('topic-subject-BSCPE');
});

app.get('/topic-BSEE', checkAuthenticated, (req, res) => {
    res.render('topic-subject-BSEE');
});


// Route to display PDFs for Mathematics


// Other endpoints for rendering lessons
app.get('/select-topic-BSCPE/math', checkAuthenticated, (req, res) => {
    const query = 'SELECT *, "topic_data" AS table_name FROM topic_data';

    db.query(query, (err, results) => {
        if (err) {
            console.error('Error fetching lessons:', err);
            return res.status(500).send('Error fetching lessons');
        }

        res.render('CPE-math-lessons', {
            lessons: results
        });
    });
});

app.get('/select-topic-BSCPE/science', checkAuthenticated, (req, res) => {
    const query = 'SELECT *, "science_topic_data" AS table_name FROM science_topic_data';

    db.query(query, (err, results) => {
        if (err) {
            console.error('Error fetching lessons:', err);
            return res.status(500).send('Error fetching lessons');
        }

        res.render('CPE-science-lessons', {
            lessons: results
        });
    });
});

app.get('/select-topic-BSCPE/profsub', checkAuthenticated, (req, res) => {
    const query = 'SELECT *, "profsub_topic_data" AS table_name FROM profsub_topic_data';

    db.query(query, (err, results) => {
        if (err) {
            console.error('Error fetching lessons:', err);
            return res.status(500).send('Error fetching lessons');
        }

        res.render('CPE-profsub-lessons', {
            lessons: results
        });
    });
});

app.get('/topic-BSEE/math', checkAuthenticated, (req, res) => {
    const query = 'SELECT *, "topic_data" AS table_name FROM topic_data';

    db.query(query, (err, results) => {
        if (err) {
            console.error('Error fetching lessons:', err);
            return res.status(500).send('Error fetching lessons');
        }

        res.render('EE-math-lessons', {
            lessons: results
        });
    });
});

app.get('/topic-BSEE/science', checkAuthenticated, (req, res) => {
    const query = 'SELECT *, "ee_science_topic_data" AS table_name FROM ee_science_topic_data';

    db.query(query, (err, results) => {
        if (err) {
            console.error('Error fetching lessons:', err);
            return res.status(500).send('Error fetching lessons');
        }

        res.render('EE-science-lessons', {
            lessons: results
        });
    });
});

app.get('/topic-BSEE/profsub', checkAuthenticated, (req, res) => {
    const query = 'SELECT *, "ee_topic_data" AS table_name FROM ee_topic_data';

    db.query(query, (err, results) => {
        if (err) {
            console.error('Error fetching lessons:', err);
            return res.status(500).send('Error fetching lessons');
        }

        res.render('EE-profsub-lessons', {
            lessons: results
        });
    });
});

// EE //
// Route for selecting subjects for BSEE
app.get('/select-subject-BSEE', checkAuthenticated, (req, res) => {
    res.render('select-subject-BSEE');
});

// Route for selecting topics for Engineering Math under BSEE
app.get('/select-topic-BSEE/Engineering%20Math', checkAuthenticated, (req, res) => {
    const course = 'BSEE';
    const subject = 'Engineering Math';
    res.render('engineering-math-topics-BSEE', { course, subject });
});

// Route for selecting topics for Engineering Science under BSEE
app.get('/select-topic-BSEE/Engineering%20Science', checkAuthenticated, (req, res) => {
    const course = 'BSEE';
    const subject = 'Engineering Science';
    res.render('engineering-science-topics-BSEE', { course, subject });
});

// Route for selecting topics for Professional Subjects under BSEE
app.get('/select-topic-BSEE/Professional%20Subjects', checkAuthenticated, (req, res) => {
    const course = 'BSEE';
    const subject = 'Professional Subjects';
    res.render('professional-subject-topics-BSEE', { course, subject });
});

// Routes for specific professional subjects under BSEE
app.get('/select-topic-BSEE/Professional%20Subjects/electronic', checkAuthenticated, (req, res) => {
    const course = 'BSEE';
    const subject = 'Electronic Circuits and Devices';
    res.render('select-electronic-type-question', { course, subject });
});

app.get('/take-exam-web/multiple-choice/electronic-circuits-and-devices', checkAuthenticated, (req, res) => {
    const topicId = 5; // Electronic Circuits topic ID

    // Fetch 10 random questions for the specified topic
    const query = `
        SELECT id, question, option_a, option_b, option_c, option_d, correct_option
        FROM electronic_circuits_questions
        WHERE topic_id = ?
        ORDER BY RAND()
        LIMIT 10
    `;

    db.query(query, [topicId], (err, results) => {
        if (err) {
            console.error('Error fetching questions:', err);
            return res.status(500).send('Error fetching questions');
        }

        // Store the questions in the session
        req.session.questions = results;

        // Render the exam form with questions and topicId
        res.render('exam-form-electronic-circuits', {
            topicId: topicId,
            questions: results
        });
    });
});



app.get('/select-topic-BSEE/Professional%20Subjects/principle', checkAuthenticated, (req, res) => {
    const course = 'BSEE';
    const subject = 'Principles of Communication';
    res.render('select-princple-type-question', { course, subject });
});

app.get('/topics/electronic-circuit-and-devices/multiple-choice', checkAuthenticated, (req, res) => {
    const subject = 'Electronic Circuits and Devices';
    const course = 'BSEE'; // Adjust as needed

    res.render('select-exam-method-electronic', {
        course,
        subject,
        questionType: 'Multiple Choice'
    });
});

app.get('/topics/principle-communication/multiple-choice', checkAuthenticated, (req, res) => {
    const subject = 'Principles of Communication';
    const course = 'BSEE'; // Adjust as needed

    res.render('select-exam-method-principle', {
        course,
        subject,
        questionType: 'Multiple Choice'
    });
});

app.get('/take-exam-web/multiple-choice/principle-communication', checkAuthenticated, (req, res) => {
    const topicId = 6; // Principles of Communication topic ID
    const questionType = 'Multiple Choice';
    const course = req.query.course; // Adjust as needed to get the course

    const questionQuery = `
        SELECT id, question, option_a, option_b, option_c, option_d, correct_option
        FROM principles_of_communication_questions
        WHERE topic_id = ?
        ORDER BY RAND()
        LIMIT 10
    `;

    db.query(questionQuery, [topicId], (err, questions) => {
        if (err) {
            console.error('Error fetching questions:', err);
            return res.status(500).send('Error fetching questions');
        }

        // Store the questions in the session
        req.session.questions = questions;

        res.render('exam-form-principle-communication', {
            topicId,
            questions,
            questionType,
            course // Pass the course variable to the EJS template
        });
    });
});


app.get('/topics/algebra-BSEE', checkAuthenticated, (req, res) => {
    const subject = 'Algebra';
    const course = 'Engineering Mathematics'; // You can adjust this as needed

    res.render('select-question-type-BSEE', {
        course,
        subject
    });
});

app.get('/topics/algebra-BSEE/multiple-choice', checkAuthenticated, (req, res) => {
    const subject = 'Algebra';
    const course = 'Engineering Mathematics'; // Adjust as needed

    res.render('select-exam-method-BSEE', {
        course,
        subject,
        questionType: 'Multiple Choice'
    });
});

app.get('/topics/algebra-EE/multiple-choice', checkAuthenticated, (req, res) => {
    const subject = 'Algebra';
    const course = 'Engineering Mathematics'; // Adjust as needed

    res.render('select-exam-method-BSEE', {
        course,
        subject,
        questionType: 'Multiple Choice'
    });
});

app.get('/topics/algebra-BSEE/computational', checkAuthenticated, (req, res) => {
    const subject = 'Algebra';
    const course = 'Engineering Mathematics'; // Adjust as needed

    res.render('select-exam-computational-method-BSEE', {
        course,
        subject,
        questionType: 'Computational'
    });
});

app.get('/topics/differential-calculus-BSEE', checkAuthenticated, (req, res) => {
    const subject = 'Differential Calculus';
    const course = 'Engineering Mathematics'; // You can adjust this as needed

    res.render('select-question-type-differential-calculus-BSEE', {
        course,
        subject
    });
});

app.get('/topics/differential-calculus-BSEE/multiple-choice', checkAuthenticated, (req, res) => {
    const subject = 'Differential Calculus';
    const course = 'Engineering Mathematics'; // Adjust as needed

    res.render('select-exam-method-differential-calculus-BSEE', {
        course,
        subject,
        questionType: 'Multiple Choice'
    });
});

app.get('/topics/differential-calculus-BSEE/computational', checkAuthenticated, (req, res) => {
    const subject = 'Differential Calculus';
    const course = 'Engineering Mathematics'; // Adjust as needed

    res.render('select-exam-computational-method-differential-BSEE', {
        course,
        subject,
        questionType: 'Computational'
    });
});

app.get('/topics/integral-calculus-BSEE', checkAuthenticated, (req, res) => {
    const subject = 'Integral Calculus';
    const course = 'Engineering Mathematics'; // You can adjust this as needed

    res.render('select-question-type-integral-calculus-BSEE', {
        course,
        subject
    });
});

app.get('/topics/integral-calculus-BSEE/multiple-choice', checkAuthenticated, (req, res) => {
    const subject = 'Integral Calculus';
    const course = 'Engineering Mathematics'; // Adjust as needed

    res.render('select-exam-method-integral-calculus-BSEE', {
        course,
        subject,
        questionType: 'Multiple Choice'
    });
});

app.get('/topics/integral-calculus-BSEE/computational', checkAuthenticated, (req, res) => {
    const subject = 'Integral Calculus';
    const course = 'Engineering Mathematics'; // Adjust as needed

    res.render('select-exam-computational-method-integral-BSEE', {
        course,
        subject,
        questionType: 'Computational'
    });
});

app.get('/topics/engineering-mechanics', checkAuthenticated, (req, res) => {
    const subject = 'Engineering Mechanics';
    const course = 'Engineering Science and Allied Subjects'; // You can adjust this as needed

    res.render('select-question-type-engineering-mechanics', {
        course,
        subject
    });
});

app.get('/topics/engineering-mechanics/multiple-choice', checkAuthenticated, (req, res) => {
    const subject = 'Engineering Mechanics';
    const course = 'Engineering Science and Allied Subjects'; // You can adjust this as needed

    res.render('select-exam-method-engineering-mechanics', {
        course,
        subject
    });
});

app.get('/take-exam-web/multiple-choice/engineering-mechanics', checkAuthenticated, (req, res) => {
    const topicId = 7; // Engineering Mechanics topic ID

    // Fetch 10 random questions for the specified topic
    const query = `
        SELECT id, question, option_a, option_b, option_c, option_d, correct_option
        FROM engineering_mechanics_questions
        WHERE topic_id = ?
        ORDER BY RAND()
        LIMIT 10
    `;

    db.query(query, [topicId], (err, results) => {
        if (err) {
            console.error('Error fetching questions:', err);
            return res.status(500).send('Error fetching questions');
        }

        // Store the questions in the session
        req.session.questions = results;

        // Render the exam form with questions and topicId
        res.render('exam-form-engineering-mechanics', {
            topicId: topicId,
            questions: results
        });
    });
});


app.get('/topics/fluid-mechanics', checkAuthenticated, (req, res) => {
    const subject = 'Fluid Mechanics';
    const course = 'Engineering Science and Allied Subjects'; // You can adjust this as needed

    res.render('select-question-type-fluid-mechanics', {
        course,
        subject
    });
});

app.get('/topics/fluid-mechanics/multiple-choice', checkAuthenticated, (req, res) => {
    const subject = 'Fluid Mechanics';
    const course = 'Engineering Science and Allied Subjects'; // You can adjust this as needed

    res.render('select-exam-method-fluid-mechanics', {
        course,
        subject
    });
});

app.get('/take-exam-web/multiple-choice/fluid-mechanics', checkAuthenticated, (req, res) => {
    const topicId = 8; // Fluid Mechanics topic ID

    // Fetch 10 random questions for the specified topic
    const query = `
        SELECT id, question, option_a, option_b, option_c, option_d, correct_option
        FROM fluid_mechanics_questions
        WHERE topic_id = ?
        ORDER BY RAND()
        LIMIT 10
    `;

    db.query(query, [topicId], (err, results) => {
        if (err) {
            console.error('Error fetching questions:', err);
            return res.status(500).send('Error fetching questions');
        }

        // Store the questions in the session
        req.session.questions = results;

        // Render the exam form with questions and topicId
        res.render('exam-form-fluid-mechanics', {
            topicId: topicId,
            questions: results
        });
    });
});


//professional subjects for CPE routes//

app.get('/select-topic-BSCPE/Professional%20Subjects/logic-circuits', checkAuthenticated, (req, res) => {
    const subject = 'Algebra';
    const course = 'Professional Subjects'; // You can adjust this as needed

    res.render('select-question-type-logic-circuits', {
        course,
        subject
    });
});




// Route to handle selecting the exam method for multiple-choice questions
app.get('/topics/logic-circuits/multiple-choice', checkAuthenticated, (req, res) => {
    const subject = 'Logic Circuits';
    const course = 'Professional Subjects'; // Adjust as needed

    res.render('select-exam-method-logic-circuits', {
        course,
        subject,
        questionType: 'Multiple Choice'
    });
});


app.get('/take-exam-web/multiple-choice/logic-circuits', checkAuthenticated, (req, res) => {
    const topicId = 17; // Algebra topic ID

    // Fetch 10 random questions for the specified topic
    const query = `
        SELECT id, question, option_a, option_b, option_c, option_d, correct_option
        FROM logic_circuit_switching_theory_multiple_choice_questions
        WHERE topic_id = ?
        ORDER BY RAND()
        LIMIT 10
    `;

    db.query(query, [topicId], (err, results) => {
        if (err) {
            console.error('Error fetching questions:', err);
            return res.status(500).send('Error fetching questions');
        }

        // Store the questions in the session
        req.session.questions = results;

        // Render the exam form with questions and topicId
        res.render('exam-form-logic-circuits', {
            topicId: topicId,
            questions: results
        });
    });
});

app.get('/select-topic-BSCPE/Professional%20Subjects/computer-fundamentals-and-programming', checkAuthenticated, (req, res) => {
    const subject = 'Computer Fundamentals and Programming';
    const course = 'Professional-Subjects'; // You can adjust this as needed

    res.render('select-question-type-computer-fundamentals-and-programming', {
        course,
        subject
    });
});




// Route to handle selecting the exam method for multiple-choice questions
app.get('/topics/computer-fundamentals-and-programming/multiple-choice', checkAuthenticated, (req, res) => {
    const subject = 'Computer Fundamentals and Programming';
    const course = 'Professional Subjects'; // Adjust as needed

    res.render('select-exam-method-computer-fundamentals-and-programming', {
        course,
        subject,
        questionType: 'Multiple Choice'
    });
});


app.get('/take-exam-web/multiple-choice/computer-fundamentals-and-programming', checkAuthenticated, (req, res) => {
    const topicId = 18; // Algebra topic ID

    // Fetch 10 random questions for the specified topic
    const query = `
        SELECT id, question, option_a, option_b, option_c, option_d, correct_option
        FROM computer_fundamentals_and_programming_multiple_choice_questions
        WHERE topic_id = ?
        ORDER BY RAND()
        LIMIT 10
    `;

    db.query(query, [topicId], (err, results) => {
        if (err) {
            console.error('Error fetching questions:', err);
            return res.status(500).send('Error fetching questions');
        }

        // Store the questions in the session
        req.session.questions = results;

        // Render the exam form with questions and topicId
        res.render('exam-form-computer-fundamentals-and-programming', {
            topicId: topicId,
            questions: results
        });
    });
});

app.get('/select-topic-BSCPE/Professional%20Subjects/computer-hardware-fundamentals', checkAuthenticated, (req, res) => {
    const subject = 'Computer Hardware Fundamentals';
    const course = 'Professional-Subjects'; // You can adjust this as needed

    res.render('select-question-type-computer-hardware-fundamentals', {
        course,
        subject
    });
});




// Route to handle selecting the exam method for multiple-choice questions
app.get('/topics/computer-hardware-fundamentals/multiple-choice', checkAuthenticated, (req, res) => {
    const subject = 'Computer Fundamentals and Programming';
    const course = 'Professional Subjects'; // Adjust as needed

    res.render('select-exam-method-computer-hardware-fundamentals', {
        course,
        subject,
        questionType: 'Multiple Choice'
    });
});


app.get('/take-exam-web/multiple-choice/computer-hardware-fundamentals', checkAuthenticated, (req, res) => {
    const topicId = 19; // Algebra topic ID

    // Fetch 10 random questions for the specified topic
    const query = `
        SELECT id, question, option_a, option_b, option_c, option_d, correct_option
        FROM computer_hardware_fundamentals_multiple_choice_questions
        WHERE topic_id = ?
        ORDER BY RAND()
        LIMIT 10
    `;

    db.query(query, [topicId], (err, results) => {
        if (err) {
            console.error('Error fetching questions:', err);
            return res.status(500).send('Error fetching questions');
        }

        // Store the questions in the session
        req.session.questions = results;

        // Render the exam form with questions and topicId
        res.render('exam-form-computer-hardware-fundamentals', {
            topicId: topicId,
            questions: results
        });
    });
});

app.get('/select-topic-BSCPE/Professional%20Subjects/engineering-ethics-and-laws', checkAuthenticated, (req, res) => {
    const subject = 'Engineering Ethics and Laws';
    const course = 'Professional-Subjects'; // You can adjust this as needed

    res.render('select-question-type-engineering-ethics-and-laws', {
        course,
        subject
    });
});




// Route to handle selecting the exam method for multiple-choice questions
app.get('/topics/engineering-ethics-and-laws/multiple-choice', checkAuthenticated, (req, res) => {
    const subject = 'Engineering Ethics and Laws';
    const course = 'Professional Subjects'; // Adjust as needed

    res.render('select-exam-method-engineering-ethics-and-laws', {
        course,
        subject,
        questionType: 'Multiple Choice'
    });
});


app.get('/take-exam-web/multiple-choice/engineering-ethics-and-laws', checkAuthenticated, (req, res) => {
    const topicId = 20; // Algebra topic ID

    // Fetch 10 random questions for the specified topic
    const query = `
        SELECT id, question, option_a, option_b, option_c, option_d, correct_option
        FROM engineering_ethics_and_computer_laws_multiple_choice_questions
        WHERE topic_id = ?
        ORDER BY RAND()
        LIMIT 10
    `;

    db.query(query, [topicId], (err, results) => {
        if (err) {
            console.error('Error fetching questions:', err);
            return res.status(500).send('Error fetching questions');
        }

        // Store the questions in the session
        req.session.questions = results;

        // Render the exam form with questions and topicId
        res.render('exam-form-engineering-ethics-and-laws', {
            topicId: topicId,
            questions: results
        });
    });
});

app.get('/select-topic-BSCPE/Professional%20Subjects/digital-signal-processing', checkAuthenticated, (req, res) => {
    const subject = 'Digital Signal Processing';
    const course = 'Professional-Subjects'; // You can adjust this as needed

    res.render('select-question-type-digital-signal-processing', {
        course,
        subject
    });
});




// Route to handle selecting the exam method for multiple-choice questions
app.get('/topics/digital-signal-processing/multiple-choice', checkAuthenticated, (req, res) => {
    const subject = 'Digital Signal Processing';
    const course = 'Professional Subjects'; // Adjust as needed

    res.render('select-exam-method-digital-signal-processing', {
        course,
        subject,
        questionType: 'Multiple Choice'
    });
});


app.get('/take-exam-web/multiple-choice/digital-signal-processing', checkAuthenticated, (req, res) => {
    const topicId = 21; // Algebra topic ID

    // Fetch 10 random questions for the specified topic
    const query = `
        SELECT id, question, option_a, option_b, option_c, option_d, correct_option
        FROM digital_signal_processing_multiple_choice_questions
        WHERE topic_id = ?
        ORDER BY RAND()
        LIMIT 10
    `;

    db.query(query, [topicId], (err, results) => {
        if (err) {
            console.error('Error fetching questions:', err);
            return res.status(500).send('Error fetching questions');
        }

        // Store the questions in the session
        req.session.questions = results;

        // Render the exam form with questions and topicId
        res.render('exam-form-digital-signal-processing', {
            topicId: topicId,
            questions: results
        });
    });
});

app.get('/topics/plane-and-solid-geometry', checkAuthenticated, (req, res) => {
    const subject = 'Plane and Solid Geometry';
    const course = 'Engineering Mathematics'; // You can adjust this as needed

    res.render('select-question-type-plane-and-solid-geometry', {
        course,
        subject
    });
});




// Route to handle selecting the exam method for multiple-choice questions
app.get('/topics/plane-and-solid-geometry/multiple-choice', checkAuthenticated, (req, res) => {
    const subject = 'Plane and Solid Geometry';
    const course = 'Engineering Mathematics'; // Adjust as needed

    res.render('select-exam-method-plane-and-solid-geometry', {
        course,
        subject,
        questionType: 'Multiple Choice'
    });
});


app.get('/take-exam-web/multiple-choice/plane-and-solid-geometry', checkAuthenticated, (req, res) => {
    const topicId = 22; // Algebra topic ID

    // Fetch 10 random questions for the specified topic
    const query = `
        SELECT id, question, option_a, option_b, option_c, option_d, correct_option
        FROM plane_and_solid_geometry_multiple_choice_questions
        WHERE topic_id = ?
        ORDER BY RAND()
        LIMIT 10
    `;

    db.query(query, [topicId], (err, results) => {
        if (err) {
            console.error('Error fetching questions:', err);
            return res.status(500).send('Error fetching questions');
        }

        // Store the questions in the session
        req.session.questions = results;

        // Render the exam form with questions and topicId
        res.render('exam-form-plane-and-solid-geometry', {
            topicId: topicId,
            questions: results
        });
    });
});

// end of CPE routes//***************************************************************** */


// Start EE routes//********************************************************* */

app.get('/select-topic-BSEE/Professional%20Subjects/power-plant-engineering', checkAuthenticated, (req, res) => {
    const subject = 'Power Plant Engineering';
    const course = 'Professional Subject'; // You can adjust this as needed

    res.render('select-question-type-power-plant-engineering', {
        course,
        subject
    });
});




// Route to handle selecting the exam method for multiple-choice questions
app.get('/topics/power-plant-engineering/multiple-choice', checkAuthenticated, (req, res) => {
    const subject = 'Power Plant Engineering';
    const course = 'Professional Subjects'; // Adjust as needed

    res.render('select-exam-method-power-plant-engineering', {
        course,
        subject,
        questionType: 'Multiple Choice'
    });
});


app.get('/take-exam-web/multiple-choice/power-plant-engineering', checkAuthenticated, (req, res) => {
    const topicId = 23; // Algebra topic ID

    // Fetch 10 random questions for the specified topic
    const query = `
        SELECT id, question, option_a, option_b, option_c, option_d, correct_option
        FROM power_plant_engineering_multiple_choice_questions
        WHERE topic_id = ?
        ORDER BY RAND()
        LIMIT 10
    `;

    db.query(query, [topicId], (err, results) => {
        if (err) {
            console.error('Error fetching questions:', err);
            return res.status(500).send('Error fetching questions');
        }

        // Store the questions in the session
        req.session.questions = results;

        // Render the exam form with questions and topicId
        res.render('exam-form-power-plant-engineering', {
            topicId: topicId,
            questions: results
        });
    });
});


app.get('/select-topic-BSEE/Professional%20Subjects/power-electronics', checkAuthenticated, (req, res) => {
    const subject = 'Power Electronics';
    const course = 'Professional Subject'; // You can adjust this as needed

    res.render('select-question-type-power-electronics', {
        course,
        subject
    });
});




// Route to handle selecting the exam method for multiple-choice questions
app.get('/topics/power-electronics/multiple-choice', checkAuthenticated, (req, res) => {
    const subject = 'Power Electronics';
    const course = 'Professional Subjects'; // Adjust as needed

    res.render('select-exam-method-power-electronics', {
        course,
        subject,
        questionType: 'Multiple Choice'
    });
});


app.get('/take-exam-web/multiple-choice/power-electronics', checkAuthenticated, (req, res) => {
    const topicId = 24; // Algebra topic ID

    // Fetch 10 random questions for the specified topic
    const query = `
        SELECT id, question, option_a, option_b, option_c, option_d, correct_option
        FROM power_electronics_multiple_choice_questions
        WHERE topic_id = ?
        ORDER BY RAND()
        LIMIT 10
    `;

    db.query(query, [topicId], (err, results) => {
        if (err) {
            console.error('Error fetching questions:', err);
            return res.status(500).send('Error fetching questions');
        }

        // Store the questions in the session
        req.session.questions = results;

        // Render the exam form with questions and topicId
        res.render('exam-form-power-electronics', {
            topicId: topicId,
            questions: results
        });
    });
});

app.get('/select-topic-BSEE/Professional%20Subjects/instrumentation-control-and-measurement', checkAuthenticated, (req, res) => {
    const subject = 'Instrumention, Control and Measurement';
    const course = 'Professional Subject'; // You can adjust this as needed

    res.render('select-question-type-instrumentation-control-and-measurement', {
        course,
        subject
    });
});




// Route to handle selecting the exam method for multiple-choice questions
app.get('/topics/instrumentation-control-and-measurement/multiple-choice', checkAuthenticated, (req, res) => {
    const subject = 'Instrumention, Control and Measurement';
    const course = 'Professional Subjects'; // Adjust as needed

    res.render('select-exam-method-instrumentation-control-and-measurement', {
        course,
        subject,
        questionType: 'Multiple Choice'
    });
});


app.get('/take-exam-web/multiple-choice/instrumentation-control-and-measurement', checkAuthenticated, (req, res) => {
    const topicId = 25; // Algebra topic ID

    // Fetch 10 random questions for the specified topic
    const query = `
        SELECT id, question, option_a, option_b, option_c, option_d, correct_option
        FROM icm_multiple_choice_questions
        WHERE topic_id = ?
        ORDER BY RAND()
        LIMIT 10
    `;

    db.query(query, [topicId], (err, results) => {
        if (err) {
            console.error('Error fetching questions:', err);
            return res.status(500).send('Error fetching questions');
        }

        // Store the questions in the session
        req.session.questions = results;

        // Render the exam form with questions and topicId
        res.render('exam-form-instrumentation-control-and-measurement', {
            topicId: topicId,
            questions: results
        });
    });
});

app.get('/select-topic-BSEE/Professional%20Subjects/control-system-analysis', checkAuthenticated, (req, res) => {
    const subject = 'Control System Analysis';
    const course = 'Professional Subject'; // You can adjust this as needed

    res.render('select-question-type-control-system-analysis', {
        course,
        subject
    });
});




// Route to handle selecting the exam method for multiple-choice questions
app.get('/topics/control-system-analysis/multiple-choice', checkAuthenticated, (req, res) => {
    const subject = 'Control System Analysis';
    const course = 'Professional Subjects'; // Adjust as needed

    res.render('select-exam-method-control-system-analysis', {
        course,
        subject,
        questionType: 'Multiple Choice'
    });
});


app.get('/take-exam-web/multiple-choice/control-system-analysis', checkAuthenticated, (req, res) => {
    const topicId = 26; // Algebra topic ID

    // Fetch 10 random questions for the specified topic
    const query = `
        SELECT id, question, option_a, option_b, option_c, option_d, correct_option
        FROM control_system_analysis_mcq
        WHERE topic_id = ?
        ORDER BY RAND()
        LIMIT 10
    `;

    db.query(query, [topicId], (err, results) => {
        if (err) {
            console.error('Error fetching questions:', err);
            return res.status(500).send('Error fetching questions');
        }

        // Store the questions in the session
        req.session.questions = results;

        // Render the exam form with questions and topicId
        res.render('exam-form-control-system-analysis   ', {
            topicId: topicId,
            questions: results
        });
    });
});

app.get('/select-topic-BSEE/Professional%20Subjects/safety', checkAuthenticated, (req, res) => {
    const subject = 'Safety';
    const course = 'Professional Subject'; // You can adjust this as needed

    res.render('select-question-type-safety', {
        course,
        subject
    });
});




// Route to handle selecting the exam method for multiple-choice questions
app.get('/topics/safety/multiple-choice', checkAuthenticated, (req, res) => {
    const subject = 'Safety';
    const course = 'Professional Subjects'; // Adjust as needed

    res.render('select-exam-method-safety', {
        course,
        subject,
        questionType: 'Multiple Choice'
    });
});


app.get('/take-exam-web/multiple-choice/safety', checkAuthenticated, (req, res) => {
    const topicId = 27; // Algebra topic ID

    // Fetch 10 random questions for the specified topic
    const query = `
        SELECT id, question, option_a, option_b, option_c, option_d, correct_option
        FROM safety_mcq
        WHERE topic_id = ?
        ORDER BY RAND()
        LIMIT 10
    `;

    db.query(query, [topicId], (err, results) => {
        if (err) {
            console.error('Error fetching questions:', err);
            return res.status(500).send('Error fetching questions');
        }

        // Store the questions in the session
        req.session.questions = results;

        // Render the exam form with questions and topicId
        res.render('exam-form-safety', {
            topicId: topicId,
            questions: results
        });
    });
});

app.get('/select-topic-BSEE/Professional%20Subjects/circuits', checkAuthenticated, (req, res) => {
    const subject = 'Circuits';
    const course = 'Professional Subject'; // You can adjust this as needed

    res.render('select-question-type-circuits', {
        course,
        subject
    });
});




// Route to handle selecting the exam method for multiple-choice questions
app.get('/topics/circuits/multiple-choice', checkAuthenticated, (req, res) => {
    const subject = 'circuits';
    const course = 'Professional Subjects'; // Adjust as needed

    res.render('select-exam-method-circuits', {
        course,
        subject,
        questionType: 'Multiple Choice'
    });
});


app.get('/take-exam-web/multiple-choice/circuits', checkAuthenticated, (req, res) => {
    const topicId = 28; // Algebra topic ID

    // Fetch 10 random questions for the specified topic
    const query = `
        SELECT id, question, option_a, option_b, option_c, option_d, correct_option
        FROM circuits_mcq
        WHERE topic_id = ?
        ORDER BY RAND()
        LIMIT 10
    `;

    db.query(query, [topicId], (err, results) => {
        if (err) {
            console.error('Error fetching questions:', err);
            return res.status(500).send('Error fetching questions');
        }

        // Store the questions in the session
        req.session.questions = results;

        // Render the exam form with questions and topicId
        res.render('exam-form-circuits', {
            topicId: topicId,
            questions: results
        });
    });
});

//EE engineering science routs //*********************************** */

app.get('/topics/strength-of-materials', checkAuthenticated, (req, res) => {
    const subject = 'Strength of Materials';
    const course = 'Engineering Science and Allied Subjects'; // You can adjust this as needed

    res.render('select-question-type-strength-of-materials', {
        course,
        subject
    });
});

app.get('/topics/strength-of-materials/multiple-choice', checkAuthenticated, (req, res) => {
    const subject = 'Strength of Materials';
    const course = 'Engineering Science and Allied Subjects'; // You can adjust this as needed

    res.render('select-exam-method-strength-of-materials', {
        course,
        subject
    });
});

app.get('/take-exam-web/multiple-choice/strength-of-materials', checkAuthenticated, (req, res) => {
    const topicId = 29; // Fluid Mechanics topic ID

    // Fetch 10 random questions for the specified topic
    const query = `
        SELECT id, question, option_a, option_b, option_c, option_d, correct_option
        FROM strength_of_materials_mcq
        WHERE topic_id = ?
        ORDER BY RAND()
        LIMIT 10
    `;

    db.query(query, [topicId], (err, results) => {
        if (err) {
            console.error('Error fetching questions:', err);
            return res.status(500).send('Error fetching questions');
        }

        // Store the questions in the session
        req.session.questions = results;

        // Render the exam form with questions and topicId
        res.render('exam-form-strength-of-materials', {
            topicId: topicId,
            questions: results
        });
    });
});

app.get('/topics/engineering-materials', checkAuthenticated, (req, res) => {
    const subject = 'Engineering Materials';
    const course = 'Engineering Science and Allied Subjects'; // You can adjust this as needed

    res.render('select-question-type-engineering-materials', {
        course,
        subject
    });
});

app.get('/topics/engineering-materials/multiple-choice', checkAuthenticated, (req, res) => {
    const subject = 'Engineering Materials';
    const course = 'Engineering Science and Allied Subjects'; // You can adjust this as needed

    res.render('select-exam-method-engineering-materials', {
        course,
        subject
    });
});

app.get('/take-exam-web/multiple-choice/engineering-materials', checkAuthenticated, (req, res) => {
    const topicId = 30; // Fluid Mechanics topic ID

    // Fetch 10 random questions for the specified topic
    const query = `
        SELECT id, question, option_a, option_b, option_c, option_d, correct_option
        FROM engineering_materials_mcq
        WHERE topic_id = ?
        ORDER BY RAND()
        LIMIT 10
    `;

    db.query(query, [topicId], (err, results) => {
        if (err) {
            console.error('Error fetching questions:', err);
            return res.status(500).send('Error fetching questions');
        }

        // Store the questions in the session
        req.session.questions = results;

        // Render the exam form with questions and topicId
        res.render('exam-form-engineering-materials', {
            topicId: topicId,
            questions: results
        });
    });
});

app.get('/topics/EE-computer-fundamentals-and-programming', checkAuthenticated, (req, res) => {
    const subject = 'Computer Fundamentals and Programming';
    const course = 'Engineering Science and Allied Subjects'; // You can adjust this as needed

    res.render('select-question-type-EE-computer-fundamentals-and-programming', {
        course,
        subject
    });
});

app.get('/topics/EE-computer-fundamentals-and-programming/multiple-choice', checkAuthenticated, (req, res) => {
    const subject = 'Computer Fundamentals and Programming';
    const course = 'Engineering Science and Allied Subjects'; // You can adjust this as needed

    res.render('select-exam-method-EE-computer-fundamentals-and-programming', {
        course,
        subject
    });
});



app.get('/topics/engineering-economy', checkAuthenticated, (req, res) => {
    const subject = 'Engineering Ecomony';
    const course = 'Engineering Science and Allied Subjects'; // You can adjust this as needed

    res.render('select-question-type-engineering-economy', {
        course,
        subject
    });
});

app.get('/topics/engineering-economy/multiple-choice', checkAuthenticated, (req, res) => {
    const subject = 'Engineering Ecomony';
    const course = 'Engineering Science and Allied Subjects'; // You can adjust this as needed

    res.render('select-exam-method-engineering-economy', {
        course,
        subject
    });
});

app.get('/take-exam-web/multiple-choice/engineering-economy', checkAuthenticated, (req, res) => {
    const topicId = 31; // Fluid Mechanics topic ID

    // Fetch 10 random questions for the specified topic
    const query = `
        SELECT id, question, option_a, option_b, option_c, option_d, correct_option
        FROM engineering_economy_mcq
        WHERE topic_id = ?
        ORDER BY RAND()
        LIMIT 10
    `;

    db.query(query, [topicId], (err, results) => {
        if (err) {
            console.error('Error fetching questions:', err);
            return res.status(500).send('Error fetching questions');
        }

        // Store the questions in the session
        req.session.questions = results;

        // Render the exam form with questions and topicId
        res.render('exam-form-engineering-economy', {
            topicId: topicId,
            questions: results
        });
    });
});

app.get('/topics/thermodynamics', checkAuthenticated, (req, res) => {
    const subject = 'Thermodynamics';
    const course = 'Engineering Science and Allied Subjects'; // You can adjust this as needed

    res.render('select-question-type-thermodynamics', {
        course,
        subject
    });
});

app.get('/topics/thermodynamics/multiple-choice', checkAuthenticated, (req, res) => {
    const subject = 'Thermodynamics';
    const course = 'Engineering Science and Allied Subjects'; // You can adjust this as needed

    res.render('select-exam-method-thermodynamics', {
        course,
        subject
    });
});

app.get('/take-exam-web/multiple-choice/thermodynamics', checkAuthenticated, (req, res) => {
    const topicId = 32; // Fluid Mechanics topic ID

    // Fetch 10 random questions for the specified topic
    const query = `
        SELECT id, question, option_a, option_b, option_c, option_d, correct_option
        FROM thermodynamics_mcqs
        WHERE topic_id = ?
        ORDER BY RAND()
        LIMIT 10
    `;

    db.query(query, [topicId], (err, results) => {
        if (err) {
            console.error('Error fetching questions:', err);
            return res.status(500).send('Error fetching questions');
        }

        // Store the questions in the session
        req.session.questions = results;

        // Render the exam form with questions and topicId
        res.render('exam-form-thermodynamics', {
            topicId: topicId,
            questions: results
        });
    });
});

app.get('/topics/EE-chemistry', checkAuthenticated, (req, res) => {
    const subject = 'Chemistry';
    const course = 'Engineering Science and Allied Subjects'; // You can adjust this as needed

    res.render('select-question-type-EE-chemistry', {
        course,
        subject
    });
});

app.get('/topics/EE-chemistry/multiple-choice', checkAuthenticated, (req, res) => {
    const subject = 'Chemistry';
    const course = 'Engineering Science and Allied Subjects'; // You can adjust this as needed

    res.render('select-exam-method-EE-chemistry', {
        course,
        subject
    });
});

app.get('/take-exam-web/multiple-choice/EE-chemistry', checkAuthenticated, (req, res) => {
    const topicId = 33; // Fluid Mechanics topic ID

    // Fetch 10 random questions for the specified topic
    const query = `
        SELECT id, question, option_a, option_b, option_c, option_d, correct_option
        FROM chemistry_multiple_choice_questions
        WHERE topic_id = ?
        ORDER BY RAND()
        LIMIT 10
    `;

    db.query(query, [topicId], (err, results) => {
        if (err) {
            console.error('Error fetching questions:', err);
            return res.status(500).send('Error fetching questions');
        }

        // Store the questions in the session
        req.session.questions = results;

        // Render the exam form with questions and topicId
        res.render('exam-form-EE-chemistry', {
            topicId: topicId,
            questions: results
        });
    });
});







const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: 'aireviewassistant@gmail.com',
        pass: 'qvhz fntc yyyc regu'
    }
});

function sendPDFEmail(userEmail, subject, pdfBuffer, callback) {
    const mailOptions = {
        from: 'aireviewassistant@gmail.com',
        to: userEmail,
        subject: subject,
        html: '<p>Please find the attached PDF for your lessons.</p>',
        attachments: [{
            filename: `${subject}.pdf`,
            content: pdfBuffer,
            contentType: 'application/pdf'
        }]
    };

    transporter.sendMail(mailOptions, (err, info) => {
        if (err) {
            return callback(err);
        }
        callback(null, info);
    });
}
function sendPDFEmail(userEmail, subject, pdfBuffer, callback) {
    const mailOptions = {
        from: 'aireviewassistant@gmail.com',
        to: userEmail,
        subject: subject,
        html: '<p>Please find the attached PDF for your lessons.</p>',
        attachments: [{
            filename: `${subject}.pdf`,
            content: pdfBuffer,
            contentType: 'application/pdf'
        }]
    };

    transporter.sendMail(mailOptions, (err, info) => {
        if (err) {
            return callback(err);
        }
        callback(null, info);
    });
}
app.get('/send-lessons-email/:topicId', checkAuthenticated, (req, res) => {
    const userId = req.session.userId;
    const topicId = req.params.topicId;

    if (!userId) {
        return res.status(401).send('User not authenticated');
    }

    getUserEmail(userId, (err, userEmail) => {
        if (err) {
            console.error('Error fetching user email:', err);
            return res.status(500).send('Error fetching user email');
        }

        const query = 'SELECT content FROM pdf_files WHERE topic_id = ?';
        db.query(query, [topicId], (err, result) => {
            if (err) {
                console.error('Error fetching PDF:', err);
                return res.status(500).send('Error fetching PDF');
            }

            if (result.length === 0) {
                return res.status(404).send('PDF not found');
            }

            const pdfBuffer = result[0].content;
            sendPDFEmail(userEmail, `Your Lesson on Topic ${topicId}`, pdfBuffer, (err, info) => {
                if (err) {
                    console.error('Error sending email:', err);
                    return res.status(500).send('Error sending email');
                }

                console.log('PDF sent to email:', userEmail);
                res.redirect('/homepage');
            });
        });
    });
});

function getUserEmail(userId, callback) {
    const query = 'SELECT email FROM user WHERE UserID = ?';
    db.query(query, [userId], (err, results) => {
        if (err) {
            return callback(err);
        }
        if (results.length === 0) {
            return callback(new Error('No user found with the given ID'));
        }
        const userEmail = results[0].email;
        callback(null, userEmail);
    });
}

function generateExamContent(questions) {
    let content = '<h1>Exam Questions</h1>';
    questions.forEach((question, index) => {
        content += `
            <div>
                <p>Question ${index + 1}: ${question.question}</p>
                <ul>
                    <li>A: ${question.option_a}</li>
                    <li>B: ${question.option_b}</li>
                    <li>C: ${question.option_c}</li>
                    <li>D: ${question.option_d}</li>
                </ul>
            </div>
        `;
    });
    return content;
}

function generateComputationalExamContent(questions) {
    let content = '<h1>Computational Exam Questions</h1>';
    questions.forEach((question, index) => {
        content += `
            <div>
                <p>Question ${index + 1}: ${question.question}</p>
            </div>
        `;
    });
    return content;
}

function sendExamEmail(userEmail, subject, content, isComputational = false, callback) {
    const mailOptions = {
        from: 'aireviewassistant@gmail.com',
        to: userEmail,
        subject: subject,
        html: content
    };

    if (isComputational) {
        pdf.create(content).toBuffer((err, buffer) => {
            if (err) {
                return callback(err);
            }
            mailOptions.attachments = [{
                filename: `${subject}.pdf`,
                content: buffer,
                contentType: 'application/pdf'
            }];
            transporter.sendMail(mailOptions, (err, info) => {
                if (err) {
                    return callback(err);
                }
                callback(null, info);
            });
        });
    } else {
        transporter.sendMail(mailOptions, (err, info) => {
            if (err) {
                return callback(err);
            }
            callback(null, info);
        });
    }
}

function createSendExamEmailEndpoint(route, tableName, subject, isComputational = false) {
    app.get(route, checkAuthenticated, (req, res) => {
        const userId = req.session.userId;

        if (!userId) {
            return res.status(401).send('User not authenticated');
        }

        getUserEmail(userId, (err, userEmail) => {
            if (err) {
                console.error('Error fetching user email:', err);
                return res.status(500).send('Error fetching user email');
            }

            console.log(`Fetching exam questions for ${subject}`);
            const query = `
                SELECT id, question${isComputational ? '' : ', option_a, option_b, option_c, option_d'}
                FROM ${tableName}
                ORDER BY RAND()
                LIMIT 10
            `;

            db.query(query, (err, questions) => {
                if (err) {
                    console.error('Error fetching questions:', err);
                    return res.status(500).send('Error fetching questions');
                }

                console.log('Questions fetched, generating PDF content...');
                const content = isComputational ? generateComputationalExamContent(questions) : generateExamContent(questions);
                sendExamEmail(userEmail, `Your ${subject} Exam`, content, isComputational, (err, info) => {
                    if (err) {
                        console.error('Error sending email:', err);
                        return res.status(500).send('Error sending email');
                    }

                    console.log('Exam sent to email:', userEmail);
                    res.redirect('/homepage');
                });
            });
        });
    });
}

// Creating endpoints for each route
createSendExamEmailEndpoint('/send-exam-email/multiple-choice/algebra', 'algebra_multiple_choice_questions', 'Algebra');
createSendExamEmailEndpoint('/send-exam-email/computational/algebra', 'algebra_computational_questions', 'Algebra', true);
createSendExamEmailEndpoint('/send-exam-email/multiple-choice/differential-calculus', 'differential_calculus_questions', 'Differential Calculus');
createSendExamEmailEndpoint('/send-exam-email/multiple-choice/integral-calculus', 'integral_calculus_questions', 'Integral Calculus');
createSendExamEmailEndpoint('/send-exam-email/multiple-choice/physics', 'physics_multiple_choice_questions', 'Physics');
createSendExamEmailEndpoint('/send-exam-email/multiple-choice/fluid-mechanics', 'fluid_mechanics_questions', 'Fluid Mechanics');
createSendExamEmailEndpoint('/send-exam-email/computational/fluid-mechanics', 'fluid_mechanics_computational_questions', 'Fluid Mechanics', true);
createSendExamEmailEndpoint('/send-exam-email/multiple-choice/engineering-mechanics', 'engineering_mechanics_questions', 'Engineering Mechanics');
createSendExamEmailEndpoint('/send-exam-email/multiple-choice/electronic-circuit-and-devices', 'electronic_circuits_questions', 'Electronic Circuit and Devices');
createSendExamEmailEndpoint('/send-exam-email/multiple-choice/princple-communication', 'principles_of_communication_questions', 'Principle of Communication');
createSendExamEmailEndpoint('/send-exam-email/multiple-choice/plane-and-solid-geometry', 'plane_and_solid_geometry_multiple_choice_questions', 'Plane and Solid Geometry');
createSendExamEmailEndpoint('/send-exam-email/computational/plane-and-solid-geometry', 'plane_solid_geometry_computational_questions', 'Plane and Solid Geometry');
createSendExamEmailEndpoint('/send-exam-email/multiple-choice/chemistry', 'chemistry_multiple_choice_questions', 'Chemistry');
createSendExamEmailEndpoint('/send-exam-email/multiple-choice/logic-circuits', 'logic_circuit_switching_theory_multiple_choice_questions', 'Logic Circuits');
createSendExamEmailEndpoint('/send-exam-email/multiple-choice/computer-fundamentals-and-programming', 'computer_fundamentals_and_programming_multiple_choice_questions', 'Computer Fumdamentals and Programming');
createSendExamEmailEndpoint('/send-exam-email/multiple-choice/computer-hardware-fundamentals', 'computer_hardware_fundamentals_multiple_choice_questions', 'Computer Hardware Fundamentals');
createSendExamEmailEndpoint('/send-exam-email/multiple-choice/engineering-ethics-and-laws', 'engineering_ethics_and_computer_laws_multiple_choice_questions', 'Engineering Ethics and Laws');
createSendExamEmailEndpoint('/send-exam-email/multiple-choice/multiple-choice/digital-signal-processing', 'digital_signal_processing_multiple_choice_questions', 'Digital Signal Processing');
createSendExamEmailEndpoint('/send-exam-email/multiple-choice/multiple-choice/power-electronics', 'power_electronics_multiple_choice_questions', 'Power Electronics');
createSendExamEmailEndpoint('/send-exam-email/multiple-choice/multiple-choice/power-plant-engineering', 'power_plant_engineering_multiple_choice_questions', 'Power Plant Engineering');
createSendExamEmailEndpoint('/send-exam-email/multiple-choice/multiple-choice/control-system-analysis', 'control_system_analysis_mcq', 'Control System Analysis');
createSendExamEmailEndpoint('/send-exam-email/multiple-choice/safety', 'safety_mcq', 'Safety');
createSendExamEmailEndpoint('/send-exam-email/multiple-choice/circuits', 'circuits_mcq', 'Circuits');



const tableMappings = {
    'topic_data': 'topic_data',
    'science_topic_data': 'science_topic_data',
    'profsub_topic_data': 'profsub_topic_data',
    'ee_math_topic_data': 'ee_math_topic_data',
    'ee_science_topic_data': 'ee_science_topic_data',
    'ee_topic_data': 'ee_topic_data'
};

async function generateSuggestions(userId) {
    return new Promise((resolve, reject) => {
        const query = `
            SELECT a.topic_id, t.topicName, a.Score, a.TotalQuestions, a.CreatedAt
            FROM assessments a
            JOIN topics t ON a.topic_id = t.topic_id
            WHERE a.UserID = ?
            ORDER BY a.CreatedAt DESC;
        `;

        db.query(query, [userId], (err, results) => {
            if (err) {
                console.error('Error retrieving assessments:', err);
                return reject('Failed to retrieve assessments');
            }

            const topicScores = {};
            const topicNames = {};
            results.forEach(result => {
                if (!topicScores[result.topic_id]) {
                    topicScores[result.topic_id] = { totalScore: 0, totalQuestions: 0 };
                    topicNames[result.topic_id] = result.topicName;
                }
                topicScores[result.topic_id].totalScore += result.Score;
                topicScores[result.topic_id].totalQuestions += result.TotalQuestions;
            });

            const weakAreas = [];
            for (const [topicID, { totalScore, totalQuestions }] of Object.entries(topicScores)) {
                const averageScore = (totalScore / totalQuestions) * 100;
                if (averageScore < 60) { // Example threshold for weak area
                    weakAreas.push({ topicID, topicName: topicNames[topicID] });
                }
            }

            resolve(weakAreas);
        });
    });
}

app.get('/analyze-assessment', checkAuthenticated, async (req, res) => {
    const userId = req.session.userId;

    if (!userId) {
        req.flash('error', 'You must be logged in to view this page.');
        return res.redirect('/login');
    }

    try {
        const suggestions = await generateSuggestions(userId);
        res.render('assessment-suggestions', { suggestions: suggestions || [], weakAreas: suggestions || [] });
    } catch (error) {
        console.error('Error generating suggestions:', error);
        return res.status(500).send('Failed to generate suggestions');
    }
});


app.post('/submit-exam', checkAuthenticated, (req, res) => {
    const userId = req.session.userId;
    const topicId = req.body.topicId;
    const answers = req.body;

    if (!userId) {
        return res.status(401).send('User not authenticated');
    }

    let tableName;
    if (topicId == 1) {
        tableName = 'algebra_multiple_choice_questions';
    } else if (topicId == 2) {
        tableName = 'differential_calculus_questions';
    } else if (topicId == 3) {
        tableName = 'integral_calculus_questions';
    } else if (topicId == 4) {
        tableName = 'physics_multiple_choice_questions';
    } else if (topicId == 5) {
        tableName = 'electronic_circuits_questions';
    } else if (topicId == 6) {
        tableName = 'principles_of_communication_questions';
    } else if (topicId == 7) {
        tableName = 'engineering_mechanics_questions';
    } else if (topicId == 8) {
        tableName = 'fluid_mechanics_questions';
    } else if (topicId == 17) {
        tableName = 'logic_circuit_switching_theory_multiple_choice_questions';
    } else if (topicId == 18) {
        tableName = 'computer_fundamentals_and_programming_multiple_choice_questions';
    } else if (topicId == 19) {
        tableName = 'computer_hardware_fundamentals_multiple_choice_questions';
    } else if (topicId == 20) {
        tableName = 'engineering_ethics_and_computer_laws_multiple_choice_questions';
    } else if (topicId == 21) {
        tableName = 'digital_signal_processing_multiple_choice_questions';
    } else if (topicId == 22) {
        tableName = 'plane_and_solid_geometry_multiple_choice_questions';
    } else if (topicId == 23) {
        tableName = 'power_plant_engineering_multiple_choice_questions';
    } else if (topicId == 24) {
        tableName = 'power_electronics_multiple_choice_questions';
    } else if (topicId == 25) {
        tableName = 'icm_multiple_choice_questions';
    } else if (topicId == 26) {
        tableName = 'control_system_analysis_mcq';
    } else if (topicId == 27) {
        tableName = 'safety_mcq';
    } else if (topicId == 28) {
        tableName = 'circuits_mcq';
    } else if (topicId == 29) {
        tableName = 'strength_of_materials_mcq';
    } else if (topicId == 30) {
        tableName = 'engineering_materials_mcq';
    } else if (topicId == 31) {
        tableName = 'engineering_economy_mcq';
    } else if (topicId == 32) {
        tableName = 'thermodynamics_mcqs';
    } else if (topicId == 33) {
        tableName = 'chemistry_multiple_choice_questions';
    } else {
        return res.status(400).send('Invalid topic ID');
    }

    // Retrieve the questions from the session
    const questions = req.session.questions;
    if (!questions || questions.length === 0) {
        return res.status(400).send('No questions found in session');
    }

    let score = 0;
    let totalQuestions = questions.length;
    questions.forEach((question, index) => {
        const userAnswer = answers[`q${index}`];
        if (userAnswer !== undefined && userAnswer === question.correct_option) {
            score++;
        }
    });

    const assessmentQuery = `
        INSERT INTO assessments (UserID, topic_id, Score, TotalQuestions)
        VALUES (?, ?, ?, ?)
    `;
    db.query(assessmentQuery, [userId, topicId, score, totalQuestions], async (err, result) => {
        if (err) {
            console.error('Error saving assessment:', err);
            return res.status(500).send('Error saving assessment');
        }

        req.session.questions = null;

        if (score === totalQuestions) {
            try {
                const suggestions = await generateSuggestions(userId);
                res.render('assessment-suggestions', { suggestions: suggestions || [], weakAreas: suggestions || [] });
            } catch (error) {
                console.error('Error generating suggestions:', error);
                return res.status(500).send('Failed to generate suggestions');
            }
        } else {
            res.redirect('/homepage');
        }
    });
});

app.post('/submit-computational-exam', checkAuthenticated, (req, res) => {
    const userId = req.session.userId;
    const topicId = req.body.topicId;
    const answers = req.body;

    if (!userId) {
        return res.status(401).send('User not authenticated');
    }

    const questions = req.session.questions;
    if (!questions) {
        return res.status(400).send('No questions found in session');
    }

    let score = 0;
    let totalQuestions = questions.length;
    questions.forEach((question, index) => {
        const userAnswer = answers[`q${index}Answer`];
        if (userAnswer !== undefined && userAnswer === question.answer.toString()) {
            score++;
        }
    });

    const assessmentQuery = `
        INSERT INTO assessments (UserID, topic_id, Score, TotalQuestions)
        VALUES (?, ?, ?, ?)
    `;
    db.query(assessmentQuery, [userId, topicId, score, totalQuestions], async (err, result) => {
        if (err) {
            console.error('Error saving assessment:', err);
            return res.status(500).send('Error saving assessment');
        }

        req.session.questions = null;

        if (score === totalQuestions) {
            try {
                const suggestions = await generateSuggestions(userId);
                res.render('assessment-suggestions', { suggestions: suggestions || [], weakAreas: suggestions || [] });
            } catch (error) {
                console.error('Error generating suggestions:', error);
                return res.status(500).send('Failed to generate suggestions');
            }
        } else {
            res.redirect('/homepage');
        }
    });
});



app.get('/analyze-assessment', checkAuthenticated, async (req, res) => {
    const userId = req.session.userId;

    if (!userId) {
        req.flash('error', 'You must be logged in to view this page.');
        return res.redirect('/login');
    }

    try {
        const { weakAreas } = await generateSuggestions(userId);

        if (weakAreas.length === 0) {
            return res.render('assessment-suggestions', { suggestions: [], weakAreas: [] });
        }

        // Generate suggestions for weak areas
        const suggestions = await generateSuggestions(weakAreas);
        res.render('assessment-suggestions', { suggestions, weakAreas });
    } catch (error) {
        console.error('Error generating suggestions:', error);
        return res.status(500).send('Failed to generate suggestions');
    }
});



app.get('/pdf/:topic_id', (req, res) => {
    const topicId = req.params.topic_id;

    const query = `SELECT content FROM pdf_files WHERE topic_id = ?`;

    db.query(query, [topicId], (err, result) => {
        if (err) {
            console.error('Error fetching PDF:', err);
            return res.status(500).send('Error fetching PDF');
        }

        if (result.length === 0) {
            return res.status(404).send('PDF not found');
        }

        const pdfBuffer = result[0].content;
        res.contentType('application/pdf');
        res.send(pdfBuffer);
    });
});

app.get('/pdf/:table/:id', (req, res) => {
    const tableKey = req.params.table;
    const topicId = req.params.id;
    const tableName = tableMappings[tableKey];

    if (!tableName) {
        return res.status(400).send('Invalid table specified');
    }

    const query = `SELECT content FROM ${tableName} WHERE topic_id = ?`;

    db.query(query, [topicId], (err, result) => {
        if (err) {
            console.error('Error fetching PDF:', err);
            return res.status(500).send('Error fetching PDF');
        }

        if (result.length === 0) {
            return res.status(404).send('PDF not found');
        }

        const pdfBuffer = result[0].content;
        res.contentType('application/pdf');
        res.send(pdfBuffer);
    });
});


app.listen(5001, () => {
    console.log("Server started on port 5001");
});
