(function (global) {

  const BASE_URL = "https://ordinals.com";
  const pages = Array(8).fill(null);

  const allPages = [
    `${BASE_URL}/content/01bba6c58af39d7f199aa2bceeaaba1ba91b23d2663bc4ef079a4b5e442dbf74i0`,
    `${BASE_URL}/content/bb01dfa977a5cd0ee6e900f1d1f896b5ec4b1e3c7b18f09c952f25af6591809fi0`,
    `${BASE_URL}/content/bb02e94f3062facf6aa2e47eeed348d017fd31c97614170dddb58fc59da304efi0`,
    `${BASE_URL}/content/bb037ec98e6700e8415f95d1f5ca1fe1ba23a3f0c5cb7284d877e9ac418d0d32i0`,
    `${BASE_URL}/content/bb9438f4345f223c6f4f92adf6db12a82c45d1724019ecd7b6af4fcc3f5786cei0`,
    `${BASE_URL}/content/bb0542d4606a9e7eb4f31051e91f7696040db06ca1383dff98505618c34d7df7i0`,
    `${BASE_URL}/content/bb06a4dffba42b6b513ddee452b40a67688562be4a1345127e4d57269e6b2ab6i0`,
    `${BASE_URL}/content/bb076934c1c22007b315dd1dc0f8c4a2f9d52f348320cfbadc7c0bd99eaa5e18i0`,
    `${BASE_URL}/content/bb084ed0d70c336861e794c5a2d41a19df8b5531b51ffe71a868695c20cafed2i0`,
  ];

  async function fillPage(page) {
    console.log(`Fetching page ${page}`);
    let data = await fetch(allPages[page]).then((r) => r.text());

    if (page === 2 || page === 3) {
      data = "[" + data + "]";
      data = JSON.parse(data);
      data = [data.slice(0, 99999), data.slice(100000, 199999)];
    } else {
      try {
        data = JSON.parse(data.replaceAll("\\n  ", ""));
      } catch (e) {}
      try {
        data = JSON.parse(data.replaceAll("  ", ""));
      } catch (e) {}
    }

    const fullSats = [];
    data[0].forEach((sat, i) => {
      if (i === 0) {
        fullSats.push(parseInt(sat));
      } else {
        fullSats.push(parseInt(fullSats[i - 1]) + parseInt(sat));
      }
    });

    let filledArray = Array(100000).fill(0);
    data[1].forEach((index, i) => {
      filledArray[index] = fullSats[i];
    });

    pages[page] = filledArray;
  }

  async function getBitmapSat(bitmapNumber) {
    const page = Math.floor(bitmapNumber / 100000);
    console.log(
      `Determining page for bitmap number ${bitmapNumber}: page ${page}`
    );
    if (!pages[page]) {
      await fillPage(page);
    }

    return pages[page][bitmapNumber % 100000];
  }

  async function getBitmapInscriptionId(bitmapNumber) {
    const sat = await getBitmapSat(bitmapNumber);
    console.log(`Fetching inscription ID for sat number ${sat}`);
    const id = await fetch(`${BASE_URL}/r/sat/${sat}/at/0`).then((r) =>
      r.json()
    );
    return id.id;
  }

  async function getInscriptionDetails(inscriptionId) {
    const url = `${BASE_URL}/r/inscription/${inscriptionId}`;
    console.log(`Fetching inscription details from ${url}`);
    const response = await fetch(url).then((r) => r.json());
    return response;
  }

  async function getInscriptionSat(inscriptionId) {
    const url = `${BASE_URL}/r/inscription/${inscriptionId}`;
    console.log(`Fetching inscription sat from ${inscriptionId}`);
    const response = await fetch(url).then((r) => r.json());
    return response.sat;
  }

  async function getInscriptionMetadata(inscriptionId) {
    const url = `${BASE_URL}/r/metadata/${inscriptionId}`;
    console.log(`Fetching inscription metadata from ${inscriptionId}`);
    const response = await fetch(url);
    // console.log('Metadata response:', response);
    const data = await response.json();
    // console.log('Metadata Content:', data);
    const hexToBytes = (hex) => {
        const bytes = new Uint8Array(Math.ceil(hex.length / 2));
        for (let i = 0; i < bytes.length; i++) {
            bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
        }
        return bytes.buffer; 
    };
    const cborData = hexToBytes(data);
    const jsonResponse = CBOR.decode(cborData);
    return jsonResponse;
  }


  async function getChildrenInscriptions(inscriptionId) {
    const children = [];
    let page = 0;
    while (true) {
      const url =
        page === 0
          ? `${BASE_URL}/r/children/${inscriptionId}`
          : `${BASE_URL}/r/children/${inscriptionId}/${page}`;
      console.log(`Fetching children inscriptions from ${url}`);
      const response = await fetch(url).then((r) => r.json());
      if (!response.ids || response.ids.length === 0) break;
      children.push(...response.ids);
      if (!response.more) break;
      page++;
    }
    return children;
  }

  async function getBlockInfo(blockHeight) {
    const url = `${BASE_URL}/r/blockinfo/${blockHeight}`;
    console.log(`Fetching block info from ${url}`);
    const response = await fetch(url).then((r) => {
      if (!r.ok) {
        throw new Error("Block info not available");
      }
      return r.json();
    });
    return response;
  }

  async function fetchInscriptionContent(inscriptionId) {
    const url = `${BASE_URL}/content/${inscriptionId}`;
    console.log(`Fetching content from ${url}`);
    const response = await fetch(url).then((r) => r.text());
    return response.trim();
  }

  async function getLastReinscriptionSat(sat) {
    console.log(`Fetching last inscription ID for sat number ${sat}`);
    const id = await fetch(`${BASE_URL}/r/sat/${sat}/at/-1`).then((r) =>
      r.json()
    );
    console.log(`Last inscription ID:`+ id.id);
    return id.id;
  }

  async function findChildContains(inscriptionId, text) {
    const children = [];
    let page = 0;

    while (true) {
      const url =
        page === 0
          ? `${BASE_URL}/r/children/${inscriptionId}`
          : `${BASE_URL}/r/children/${inscriptionId}/${page}`;
      
      console.log(`Fetching children inscriptions from ${url}`);
      
      const response = await fetch(url).then((r) => r.json());
      if (!response.ids || response.ids.length === 0) break;
      
      for (let childId of response.ids) {
        const containsText = await foEachChildFindContent(childId, text);
        if (containsText) {
          return childId;  // Return the child inscription ID that contains the text
        }
      }

      if (!response.more) break;
      page++;
    }
    return null;  // Return null if no child contains the text
  }

  async function foEachChildFindContent(childId, text) {
    const content = await fetchInscriptionContent(childId); 
    return content.includes(text);  // Check if the content includes the text
  }

  async function findAllPathscriberChildren(inscriptionId,domain) {
    const pathscriberIds = [];
    const foundNumbers = new Set();  // Set to store already found numbers
    let page = 0;

    while (true) {
      const url =
        page === 0
          ? `${BASE_URL}/r/children/${inscriptionId}`
          : `${BASE_URL}/r/children/${inscriptionId}/${page}`;
      
      console.log(`Fetching children inscriptions from ${url}`);
      
      const response = await fetch(url).then((r) => r.json());

      if (!response.ids || response.ids.length === 0) break;
      
      for (let childId of response.ids) {
        const content = await fetchInscriptionContent(childId);  // Fetch the content of each child
        const match = content.match(new RegExp(`^(\\d+)\\.${domain}$`));  // Regex to match numbers ending with `.pathscriber`
        
        if (match) {
          const number = match[1];  // Extract the number part
          if (!foundNumbers.has(number)) {  // If this number hasn't been found before
            pathscriberIds.push(childId);  // Add the child inscription ID
            foundNumbers.add(number);  // Mark the number as found
          }
        }
      }

      if (!response.more) break;  // Exit the loop if no more pages
      page++;
    }

    return pathscriberIds;  // Return the array of matching inscription IDs
  }


  global.getBitmapSat = getBitmapSat;
  global.getBitmapInscriptionId = getBitmapInscriptionId;
  global.getInscriptionDetails = getInscriptionDetails;
  global.getChildrenInscriptions = getChildrenInscriptions;
  global.getBlockInfo = getBlockInfo;
  global.fetchInscriptionContent = fetchInscriptionContent;
  global.getLastReinscriptionSat = getLastReinscriptionSat;
  global.findChildContains = findChildContains;
  global.findAllPathscriberChildren = findAllPathscriberChildren;
  global.getInscriptionSat = getInscriptionSat;
  global.getInscriptionMetadata = getInscriptionMetadata;
})(window);
