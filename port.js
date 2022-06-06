const fs = require('fs');
const data = fs.readFileSync('./docs/CCs.md');

let names = [];
let entities = {};

let currentEntity = '';

const split = data.toString().split('\n');
for (const line of split) {
    if (line.startsWith('#') && !line.startsWith('# Entities'))
        break;

    if (line.trim().startsWith('* ')) {
        const entity = line.trim().substring(2).replace(/(\[\w+\]|(\r)?\n)/g, '').trim();

        if (entity.length == 0)
            continue;

        currentEntity = entity;
        entities[currentEntity] = [];
    }

    if (line.trim().startsWith('- ')) {
        const name = line.trim().substring(2).replace(/(\[\w+\]|(\r)?\n)/g, '').trim();

        if (name.length == 0)
            continue;

        names.push(name);
        entities[currentEntity].push(name);
    }
}

fs.writeFileSync('./names.txt', names.map(a => `${a}\r\n`).join(''));

let ymlData = ``;
for (const entityName of Object.keys(entities)) {
    const entity = entities[entityName];
    ymlData += `${entityName}:\r\n${entity.map(a => `    - ${a}`).join('\r\n')}\r\n`;
}

fs.writeFileSync('./content_creators.yml', ymlData);