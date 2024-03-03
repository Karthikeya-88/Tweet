const express = require('express')
const app = express()
const {open} = require('sqlite')
const sqlite3 = require('sqlite3')
const path = require('path')
const bcrypt = require('bcrypt')
const jwt = require('jsonwebtoken')

app.use(express.json())
const dbPath = path.join(__dirname, 'twitterClone.db')
let db

const initializeDBAndServer = async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    })
    app.listen(3000, () => {
      console.log('Server Running at http://localhost:3000/')
    })
  } catch (e) {
    console.log(`DB Error: ${e.message}`)
    process.exit(1)
  }
}
initializeDBAndServer()

const getFollowerPeopleIdsOfUser = async username => {
  const getTheFollowingPeople = `SELECT following_user_id FROM follower INNER JOIN user
   ON user.user_id = follower.follower_user_id WHERE user.username = '${username}';`
  const followingPeople = await db.all(getTheFollowingPeople)
  const arrayOfIds = followingPeople.map(eachUser => eachUser.following_user_id)
  return arrayOfIds
}

const authenticationToken = (request, response, next) => {
  let jwtToken
  const authHeader = request.headers['authorization']
  if (authHeader) {
    jwtToken = authHeader.split(' ')[1]
  }

  if (jwtToken) {
    jwt.verify(jwtToken, 'SECRET_KEY', (error, payload) => {
      if (error) {
        response.status(401)
        response.send('Invalid JWT Token')
      } else {
        request.username = payload.username
        request.userId = payload.userId
        next()
      }
    })
  } else {
    response.status(401)
    response.send('Invalid JWT Token')
  }
}

const tweetVerification = async (request, response, next) => {
  const {userId} = request
  const {tweetId} = request.params
  const getTweetQuery = `SELECT * FROM tweet INNER JOIN follower ON tweet.user_id = 
  follower.following_user_id 
  WHERE tweet.tweet_id = '${tweetId}' AND follower_user_id = '${userId}';`
  const tweet = await db.get(getTweetQuery)
  if (tweet === undefined) {
    response.status(401)
    response.send('Invalid Request')
  } else {
    next()
  }
}

//API 1
app.post('/register/', async (request, response) => {
  const {username, password, name, gender} = request.body
  const getUserQuery = `SELECT * FROM user WHERE username = '${username}';`
  const userDBDetails = await db.get(getUserQuery)
  if (userDBDetails !== undefined) {
    response.status(400)
    response.send('User already exists')
  } else {
    if (password.length < 6) {
      response.status(400)
      response.send('Password is too short')
    } else {
      const hashedPassword = await bcrypt.hash(password, 10)
      const createUser = `INSERT INTO user(username, password, name, gender)
      VALUES ('${username}', '${hashedPassword}', '${name}', '${gender}');`
      await db.run(createUser)
      response.send('User created successfully')
    }
  }
})

//API 2
app.post('/login/', async (request, response) => {
  const {username, password} = request.body
  const getUserQuery = `SELECT * FROM user WHERE username = '${username}';`
  const userDBDetails = await db.get(getUserQuery)
  if (userDBDetails !== undefined) {
    const isPasswordMatched = await bcrypt.compare(
      password,
      userDBDetails.password,
    )
    if (isPasswordMatched) {
      const payload = {username, userId: userDBDetails.user_id}
      const jwtToken = jwt.sign(payload, 'SECRET_KEY')
      response.send({jwtToken})
    } else {
      response.status(400)
      response.send('Invalid password')
    }
  } else {
    response.status(400)
    response.send('Invalid user')
  }
})

//API 3
app.get(
  '/user/tweets/feed/',
  authenticationToken,
  async (request, response) => {
    const {username} = request
    const followingPeopleId = await getFollowerPeopleIdsOfUser(username)
    const getTweetQuery = `SELECT username, tweet, date_time as dateTime FROM user INNER JOIN 
    tweet ON user.user_id = tweet.user_id WHERE user.user_id IN (${followingPeopleId}) 
    ORDER BY date_time 
    DESC LIMIT 4;`
    const tweets = await db.all(getTweetQuery)
    response.send(tweets)
  },
)

//API 4
app.get('/user/following/', authenticationToken, async (request, response) => {
  const {username, userId} = request
  const getFollowingUserQuery = `SELECT name FROM follower INNER JOIN user 
  ON user.user_id = follower.following_user_id 
  WHERE follower_user_id = '${userId}';`
  const followingPeople = await db.all(getFollowingUserQuery)
  response.send(followingPeople)
})

//API 5
app.get('/user/followers/', authenticationToken, async (request, response) => {
  const {username, userId} = request
  const getFollowerQuery = `SELECT DISTINCT name FROM follower INNER JOIN user
  ON user.user_id = follower.follower_user_id
  WHERE following_user_id = '${userId}';`
  const followers = await db.all(getFollowerQuery)
  response.send(followers)
})

//API 6
app.get(
  '/tweets/:tweetId/',
  authenticationToken,
  tweetVerification,
  async (request, response) => {
    const {username, userId} = request
    const {tweetId} = request.params
    const getTweetQuery = `SELECT tweet, 
    (SELECT COUNT() FROM Like WHERE tweet_id = '${tweetId}') AS likes,
    (SELECT COUNT() FROM reply WHERE tweet_id = '${tweetId}') AS replies,
    date_time AS dateTime
    FROM tweet
    WHERE tweet.tweet_id = ${tweetId};`
    const tweet = await db.get(getTweetQuery)
    response.send(tweet)
  },
)

//API 7
app.get(
  '/tweets/:tweetId/likes/',
  authenticationToken,
  tweetVerification,
  async (request, response) => {
    const {tweetId} = request.params
    const getLikesQuery = `SELECT username FROM 
    user INNER JOIN like ON user.user_id = like.user_id 
    WHERE tweet_id = '${tweetId}';`
    const likedUsers = await db.all(getLikesQuery)
    const usersArray = likedUsers.map(eachUser => eachUser.username)
    response.send({likes: usersArray})
  },
)

//API 8
app.get(
  '/tweets/:tweetId/replies/',
  authenticationToken,
  tweetVerification,
  async (request, response) => {
    const {tweetId} = request.params
    const getReplyQuery = `SELECT name, reply 
  FROM user INNER JOIN reply ON user.user_id = reply.user_id 
  WHERE tweet_id = '${tweetId}';`
    const repliedUsers = await db.all(getReplyQuery)
    response.send({replies: repliedUsers})
  },
)

//API 9
app.get('/user/tweets/', authenticationToken, async (request, response) => {
  const {userId} = request
  const getTweetQuery = `SELECT tweet,
  COUNT(DISTINCT like_id) AS likes,
  COUNT(DISTINCT reply_id) AS replies,
  date_time AS dateTime
  FROM tweet LEFT JOIN reply ON tweet.tweet_id = reply.tweet_id LEFT JOIN like ON 
  tweet.tweet_id = like.tweet_id WHERE tweet.user_id = ${userId} 
   GROUP BY tweet.tweet_id;`
  const tweets = await db.all(getTweetQuery)
  response.send(tweets)
})

//API 10
app.post('/user/tweets/', authenticationToken, async (request, response) => {
  const {tweet} = request.body
  const userId = parseInt(request.userId)
  const dateTime = new Date().toJSON().substring(0, 19).replace('T', ' ')
  const createTweetTable = `INSERT INTO tweet(tweet, user_id, date_time) VALUES
  ('${tweet}', '${userId}', '${dateTime}');`

  await db.run(createTweetTable)
  response.send('Created a Tweet')
})

//API 11
app.delete(
  '/tweets/:tweetId/',
  authenticationToken,
  async (request, response) => {
    const {tweetId} = request.params
    const {userId} = request
    const getTheTweetQuery = `SELECT * FROM tweet WHERE user_id = '${userId}' AND tweet_id = '${tweetId}';`
    const tweet = await db.get(getTheTweetQuery)
    console.log(tweet)
    if (tweet === undefined) {
      response.status(401)
      response.send('Invalid Request')
    } else {
      const deleteQuery = `DELETE FROM tweet WHERE tweet_id = '${tweetId}';`
      await db.run(deleteQuery)
      response.send('Tweet Removed')
    }
  },
)
module.exports = app
