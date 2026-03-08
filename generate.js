#!/usr/bin/env node

const { chdir, exit } = require("node:process")
const { execFileSync } = require("node:child_process");
const { createHash } = require("node:crypto");
const { existsSync, writeFileSync, readFileSync, unlinkSync } = require("node:fs");

console.log("Running exiftool...");

chdir(__dirname);

let metadata;
try {
  metadata = JSON.parse(execFileSync("exiftool", [ "-r", "-j", "music" ], { encoding: "utf-8", maxBuffer: 64 * 1024 * 1024 }));
} catch (err) {
  try {
    metadata = JSON.parse(err.stdout);
  } catch {
    console.log("Failed to parse exiftool output, your music directory is likely empty.");
    exit();
  }
}

let oldOutput = {};
let output = {};
let processedFiles = 0;
let importedPictures = 0;
let noTrackNumber = "";

if (existsSync("info.json")) {
  oldOutput = JSON.parse(readFileSync("info.json", "utf-8"));
}

for (let file of metadata) {
  if (!file.MIMEType?.startsWith("audio/")) {
    console.log(`Skipped non audio file ${file.SourceFile}`);
    continue;
  }
  
  const artist = file.Band ? file.Band : (file.Albumartist ? file.Albumartist : (file.Artist ? file.Artist : "Unknown Artist"));
  const album = file.Album ? file.Album : file.FileName;
  const title = file.Title ? file.Title : file.FileName;
  
  if (!output[artist]) {
    output[artist] = {};
  }
  
  if (!output[artist][album]) {
    output[artist][album] = [];
  }
  
  let trackNumber;
  let discNumber = file.PartOfSet ? parseInt(file.PartOfSet) : (file.Discnumber ? parseInt(file.Discnumber) : 0);
  
  if (file.TrackNumber) {
    trackNumber = parseInt(file.TrackNumber)-1 + discNumber*1000;
  } else if (file.Track) {
    trackNumber = parseInt(file.Track)-1 + discNumber*1000;
  } else {
    console.log(`File ${file.SourceFile} has no track number, please edit the metadata`);
    noTrackNumber += `${file.SourceFile}\n`;
    trackNumber = output[artist][album].length;
  }
  
  let picturePath = "";
  
  // If this track appears in the old info.json, skip handling the picture
  if (oldOutput[artist]?.[album]?.[trackNumber]?.title === title) {
    picturePath = oldOutput[artist][album][trackNumber].picture;
  } else {
    let picture = file.Picture ? execFileSync("exiftool", [ "-b", "-picture", file.SourceFile ], { maxBuffer: 64 * 1024 * 1024 }) : null;
    
    if (picture) {
      const hash = createHash("md5");
      hash.update(picture);
      picturePath = `pictures/${hash.digest("hex")}.${file.PictureMIMEType.split("/")[1]}`;
      
      if (!existsSync(picturePath)) {
        writeFileSync(picturePath, picture);
        console.log(`Imported picture ${picturePath}`);
        importedPictures++;
      }
    }
  }
  
  output[artist][album][trackNumber] = {
    title: title,
    file: file.SourceFile,
    picture: picturePath !== "" ? picturePath : "assets/no-picture.svg",
  };
  
  processedFiles++;
}

// Remove sparse arrays
for (let artist in output) {
  for (let album in output[artist]) {
    output[artist][album] = output[artist][album].filter(() => true);
  }
}

writeFileSync("info.json", JSON.stringify(output));

if (noTrackNumber) {
  writeFileSync("no-track-number.txt", noTrackNumber);
} else if (existsSync("no-track-number.txt")) {
  unlinkSync("no-track-number.txt");
}

console.log(`\nProcessed ${processedFiles} files, imported ${importedPictures} pictures.`);

if (noTrackNumber) {
  console.log("Files without track numbers have been written to no-track-number.txt");
}
