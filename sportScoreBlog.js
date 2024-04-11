import fetch from 'node-fetch';
import axios from 'axios';
import { CookieJar } from 'tough-cookie';
import { wrapper } from 'axios-cookiejar-support';

const jar = new CookieJar();
const client = wrapper(axios.create({ jar }));
let csrfToken = '';

//upload image to server

async function uploadImage(imageName, imagePath) {
  csrfToken = await getCsrfToken();
  const homeTeamName = imageName.home_team?.name || '';
  const awayTeamName = imageName.away_team?.name || '';

  try {
    const imageResponse = await fetch(imagePath);
    if (!imageResponse.ok) throw new Error('Failed to fetch the image.');

    const imageBlob = await imageResponse.blob();

    let formData = new FormData();
    formData.append('title', `${homeTeamName}-${awayTeamName}`);
    formData.append('alt_text', `${homeTeamName}-${awayTeamName}`);
    formData.append('file', imageBlob, 'image.webp');

    const response = await fetch('https://sportscore.io/api/v1/blog/bot-images/', {
      method: 'POST',
      headers: {
        'accept': 'application/json',
        'X-API-Key': 'uqzmebqojezbivd2dmpakmj93j7gjm',
        'X-Csrftoken': csrfToken,
        'Cookie': `csrftoken=${csrfToken}`,
        'Origin': 'https://sportscore.io'
      },
      body: formData
    });

    if (!response.ok) throw new Error('Failed to upload the image.');

    const result = await response.json();
    console.log('Upload successful', result);
    return result.id;
  } catch (error) {
    console.error('Error uploading image:', error);
  }
}

//fetch csrfToken

async function getCsrfToken() {
  return client.get('https://sportscore.io/api/v1/blog/?page=0', {
    headers: {
        "accept": "application/json",
        'X-API-Key': 'uqzmebqojezbivd2dmpakmj93j7gjm',
    },
    }).then(response => {
        const csrfToken = jar.getCookiesSync('https://sportscore.io').find(cookie => cookie.key === 'csrftoken')?.value;
        console.log('CSRF Token:', csrfToken);
        return csrfToken;
    }).catch(error => {
        console.error('Error:', error);
    });
}

//get current Date
function getCurrentFormattedDate() {
  const date = new Date();
  const year = date.getFullYear();
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const day = date.getDate().toString().padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// post article to sportscore blog page
async function postBlog(item, match, article, imgID) {
  const homeTeamName = item.home_team?.name || '';
  const awayTeamName = item.away_team?.name || '';
  const competitionName = match.competition?.name || '';
  const articleContent = article.data[0].content;
  let result = articleContent.replace(/br\/>/g, '<br/>   ');
  result = result.replace(/#+/g, match => '<br/>   '.repeat(match.length));

  const url = 'https://sportscore.io/api/v1/blog/bot-posts/';
  const data = {
    path: `${homeTeamName.toLowerCase().replace(/ /g, '-')}-vs-${awayTeamName.toLowerCase().replace(/ /g, '-')}`,
    content: `${result}`,
    title: `🎌Match Started!🎌 💥⚽️💥 <br/> ${homeTeamName} vs ${awayTeamName} League: ${competitionName} 💥⚽️💥`,
    description: "description",
    is_visible: true,
    created_on: getCurrentFormattedDate(),
    preview_image: imgID,
  };

  const options = {
    method: 'POST',
    headers: {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
      'X-API-Key': 'uqzmebqojezbivd2dmpakmj93j7gjm',
      'X-Csrftoken': `${csrfToken}`,
      'Cookie': `csrftoken=${csrfToken}`,
      'Origin': 'https://sportscore.io'
    },
    body: JSON.stringify(data)
  };

  try {
    const response = await fetch(url, options);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.body}`);
    }
    const jsonResponse = await response.json();
    console.log('Blog response: ', jsonResponse);
  } catch (error) {
    console.error('Error posting blog:', error);
  }
}

// get article from Writesonic
async function fetchArticle(item) {
  const homeTeamName = item.home_team?.name || '';
  const awayTeamName = item.away_team?.name || '';

  const options = {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
      'X-API-KEY': '27bd417b-5fd1-4dfc-9523-bbfc462a944b'
    },
    body: JSON.stringify({
      article_title: `${homeTeamName} vs ${awayTeamName}`,
      article_intro: `write an article about the start of the match between team ${homeTeamName} and team ${awayTeamName}, and also write some interesting facts about the team members and team statistics`,
      article_sections: [' ']
    })
  };

  try {
    const response = await fetch('https://api.writesonic.com/v2/business/content/ai-article-writer-v3?engine=premium&language=en', options);
    const jsonResponse = await response.json();
    return jsonResponse;
  } catch (err) {
    console.error(err);
  }
}

async function processItem(item, match) {
    if (Number(item.state_display) && Number(item.state_display) < 2) {
      const article = await fetchArticle(item);

      if(article.data[0].content && article.data[0].content.length > 500) {
        const image_id = await uploadImage(item, item.social_picture);
        await postBlog(item, match, article, image_id);
      }
    }
}

async function getMatch(matches) {
  for (const match of matches) {
      for (const item of match.matches) {
          await processItem(item, match);
      }
  }
}

// get data from Sport Score

function fetchData() {
  client.get('https://sportscore.io/api/v1/football/matches/?match_status=live&sort_by_time=false&page=0', {
      headers: {
          "accept": "application/json",
          'X-API-Key': 'uqzmebqojezbivd2dmpakmj93j7gjm',
      },
  })
  .then(response => {
      getMatch(response.data.match_groups);
  })
  .catch(error => {
      console.error('Error:', error);
  });
}

// start every 1 minute
setInterval(fetchData, 60000);

fetchData();