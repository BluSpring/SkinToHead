const fs = require('fs');
const axios = require('axios').default;
const pngjs = require('pngjs');
const init = require('3d-core-raub');

if (!fs.existsSync('./username_cache.json'))
    fs.writeFileSync('./username_cache.json', '{}');

let cache = require('./username_cache.json');

if (!fs.existsSync('./names.txt'))
    fs.writeFileSync('./names.txt', '');

if (!fs.existsSync('./skins'))
    fs.mkdirSync('./skins');

if (!fs.existsSync('./heads'))
    fs.mkdirSync('./heads');

const usernames = fs.readFileSync('./names.txt').toString();

// Flags
const shouldOverwrite = process.argv.includes('--overwrite') || process.argv.includes('--overwrite-skins');
const shouldRedoHeads = process.argv.includes('--overwrite') || process.argv.includes('--overwrite-heads');
const noUpscaling = !process.argv.includes('--upscale');
const noSmall = process.argv.includes('--no-small');
const makeAtlas = process.argv.includes('--atlas');
const upscaledAtlas = makeAtlas && (!noUpscaling || process.argv.includes('--upscaled-atlas') || process.argv.includes('--upscale-atlas'));
const addNames = process.argv.includes('--named');

if (noSmall && noUpscaling) {
    console.log(`Bro what the fuck are you doing`);
    process.exit(1);
}

let MAX_TEXTURE_SIZE = 8192;

if (makeAtlas) {
    const { gl, window } = init({
        title: `(test window for max texture size)`
    });

    MAX_TEXTURE_SIZE = gl.getParameter(gl.MAX_TEXTURE_SIZE) / 2;
    console.log(`[!] Max texture size detected to be ${MAX_TEXTURE_SIZE * 2}, dividing by 2.`);

    window.destroy();
}

function getSteveOrAlex(uuid) {
    if (!uuid || uuid.length <= 16) {
        // we can't get the skin type by username
        return "steve";
    } else {
        // great thanks to Minecrell for research into Minecraft and Java's UUID hashing!
        // https://git.io/xJpV
        // MC uses `uuid.hashCode() & 1` for alex
        // that can be compacted to counting the LSBs of every 4th byte in the UUID
        // an odd sum means alex, an even sum means steve
        // XOR-ing all the LSBs gives us 1 for alex and 0 for steve
        var lsbs_even = parseInt(uuid[ 7], 16) ^
                        parseInt(uuid[15], 16) ^
                        parseInt(uuid[23], 16) ^
                        parseInt(uuid[31], 16);
        return lsbs_even ? "alex" : "steve";
    }
}

(async () => {
    for (const name of usernames.split(/\n|\r\n/g)) {
        if (fs.existsSync(`./heads/${name}.png`) && !shouldRedoHeads) {
            console.log(`[] Found that we already have ${name}'s head done, skipping.`);

            continue;
        }

        console.log(`- Creating head of ${name}...`);
        let uuid = cache[name];

        if (!uuid) {
            try {
                uuid = (await axios.get(`https://api.mojang.com/users/profiles/minecraft/${name}`)).data.id;

                cache[name] = uuid;
            } catch (e) {
                console.error(`\n!!!! ERROR !!!! -- Failed to get ${name}'s UUID from Mojang's servers!\n${e.message}\n`);
                continue;
            }
        }

        if ((fs.existsSync(`./skins/${uuid}.png`) || fs.existsSync(`./skins/${name}_${uuid}.png`)) && !shouldOverwrite) {
            console.log(`[] Found that we already have ${name}'s skin downloaded, skipping download step.`);
        }

        /**
         * @type {Buffer}
         */
        let skinData = fs.existsSync(`./skins/${uuid}.png`) && !shouldOverwrite ? fs.readFileSync(`./skins/${uuid}.png`) : fs.existsSync(`./skins/${name}_${uuid}.png`) ? fs.readFileSync(`./skins/${name}_${uuid}.png`) : null;

        let writeStream = null;

        if (!skinData)
            try {
                const skin = (await axios.get(`https://sessionserver.mojang.com/session/minecraft/profile/${uuid}`)).data;

                const base64 = skin.properties[0].value;
                writeStream = fs.createWriteStream(`./skins/${addNames ? `${name}_` : ''}${uuid}.png`);
                
                (await axios.get(JSON.parse(Buffer.from(base64, 'base64').toString()).textures.SKIN.url, { responseType: 'stream' }))
                    .data
                    .pipe(writeStream);
            } catch (e) {
                console.error(`\n!!!! ERROR !!!! -- Failed to get ${name}'s skin from Mojang's servers! However, we can determine that ${name} is a ${getSteveOrAlex(uuid)} skin.\n${e.message}\n`);
                continue;
            }

        // Head making step

        function makeHead() {
            const head = new pngjs.PNG({ width: 8, height: 8 });
            const upscaledHead = new pngjs.PNG({ width: 256, height: 256 });

            fs.createReadStream(`./skins/${fs.existsSync(`./skins/${name}_${uuid}.png`) ? `${name}_` : ''}${uuid}.png`)
                .pipe(new pngjs.PNG())
                .on('parsed', function () {
                    // The first layer should not have alpha.
                    const mainHead = new pngjs.PNG({ width: 8, height: 8, inputColorType: 2 });
                    const topHead = new pngjs.PNG({ width: 8, height: 8 });

                    this.bitblt(mainHead, 8, 8, 8, 8, 0, 0); // Copy main face
                    this.bitblt(topHead, 40, 8, 8, 8, 0, 0); // Copy second face

                    mainHead.bitblt(head, 0, 0, 8, 8, 0, 0); // Copy the main head first.
                    
                    for (let y = 0; y < head.height; y++) {
                        for (let x = 0; x < head.width; x++) {
                            const coords = (head.width * y + x) << 2;

                            // The alpha blending equation requires clamped values of [0, 1].
                            const mainR = mainHead.data[coords] / 255;
                            const mainG = mainHead.data[coords + 1] / 255;
                            const mainB = mainHead.data[coords + 2] / 255;
                            const mainA = mainHead.data[coords + 3] / 255;

                            const topR = topHead.data[coords] / 255;
                            const topG = topHead.data[coords + 1] / 255;
                            const topB = topHead.data[coords + 2] / 255;
                            const topA = topHead.data[coords + 3] / 255;

                            // Alpha blending
                            head.data[coords + 3] = ((1 - topA) * mainA + topA) * 255;
                            head.data[coords] = ((1 - topA) * mainA * mainR + topA * topR) / (head.data[coords + 3] / 255) * 255;
                            head.data[coords + 1] = ((1 - topA) * mainA * mainG + topA * topG) / (head.data[coords + 3] / 255) * 255;
                            head.data[coords + 2] = ((1 - topA) * mainA * mainB + topA * topB) / (head.data[coords + 3] / 255) * 255;
                        }
                    }

                    // Run basic upscaling

                    const workSpace = upscaledHead.width / head.width;

                    if (!noUpscaling)
                        for (let y = 0; y < head.height; y++) {
                            for (let x = 0; x < head.width; x++) {
                                const coords = (head.width * y + x) << 2;

                                for (let j = 0; j < upscaledHead.height / head.height; j++) {
                                    for (let i = 0; i < upscaledHead.width / head.width; i++) {
                                        // upX = (x * 32) + i
                                        // upY = (y * 32) + j

                                        // 012 345 678 901
                                        // 234 567 890 123

                                        const upX = ((x * workSpace) + i);
                                        const upY = ((y * workSpace) + j);

                                        const upscaledCoords = upscaledHead.width * upY + upX << 2;

                                        upscaledHead.data[upscaledCoords] = head.data[coords];
                                        upscaledHead.data[upscaledCoords + 1] = head.data[coords + 1];
                                        upscaledHead.data[upscaledCoords + 2] = head.data[coords + 2];
                                        upscaledHead.data[upscaledCoords + 3] = head.data[coords + 3];
                                    }
                                }
                            }
                        }

                    // Write the data
                    if (!noSmall)
                        head.pack().pipe(fs.createWriteStream(`./heads/${name}.png`));
                    if (!noUpscaling)
                        upscaledHead.pack().pipe(fs.createWriteStream(`./heads/${name}_upscaled.png`));

                    console.log(`[!] Created head of ${name}.`);
                });
        }

        // Works around an issue where pngjs throws an "Unexpected end of input" error
        if (writeStream)
            writeStream.once('close', makeHead);
        else
            makeHead();
    };

    fs.writeFileSync('./username_cache.json', JSON.stringify(cache));

    if (makeAtlas) {
        const atlas = new pngjs.PNG({ width: MAX_TEXTURE_SIZE, height: MAX_TEXTURE_SIZE });
        let textureSize = upscaledAtlas ? 256 : 8;
        const split = usernames.split(/\n|\r\n/g);

        let y = 0;
        let j = 0;

        for (let i = 0; i < split.length; i++) {
            if (!fs.existsSync(`./heads/${split[i]}${upscaledAtlas ? '_upscaled' : ''}.png`)) {
                console.error(`!!!! ERROR !!!! -- ${split[i]} does not have an existing head!`);
                continue;
            }

            fs.createReadStream(`./heads/${split[i]}${upscaledAtlas ? '_upscaled' : ''}.png`)
                .pipe(new pngjs.PNG())
                .on('parsed', function () {
                    const x = (textureSize * i) % (MAX_TEXTURE_SIZE);
                    if (x == 0) {
                        y = (((textureSize * j++) / (MAX_TEXTURE_SIZE * textureSize)) * textureSize) * MAX_TEXTURE_SIZE;
                    }

                    if (y > MAX_TEXTURE_SIZE) {
                        throw Error(`Exceeded max texture size!`);
                    }
                    
                    const coords = (MAX_TEXTURE_SIZE * y + x) << 2;

                    for (let imgY = 0; imgY < this.height; imgY++) {
                        for (let imgX = 0; imgX < this.width; imgX++) {
                            const imgCoords = (this.width * imgY + imgX) << 2;

                            atlas.data[coords] = this.data[imgCoords];
                            atlas.data[coords + 1] = this.data[imgCoords + 1];
                            atlas.data[coords + 2] = this.data[imgCoords + 2];
                            atlas.data[coords + 3] = 255;
                        }
                    }

                    //this.bitblt(atlas, 0, 0, this.width, this.height, x, y);
                });
        }

        // Need to wait.
        setTimeout(() => {
            atlas.pack().pipe(fs.createWriteStream('./head_atlas.png'));
            console.log(`[!] Successfully made ${MAX_TEXTURE_SIZE}x${MAX_TEXTURE_SIZE} atlas.`);
        }, 5_000);
    }
})();