#!/usr/bin/env node

const { chdir } = require("node:process")
const { execFileSync } = require("node:child_process");
const { createHash } = require("node:crypto");
const { existsSync, writeFileSync, readFileSync } = require("node:fs");

console.log("Running exiftool...");

chdir(__dirname);
const metadata = JSON.parse(execFileSync("exiftool", [ "-r", "-j", "music" ], { encoding: "utf-8" }));

let oldOutput = {};
let output = {};
let processedFiles = 0;
let importedPictures = 0;

if (existsSync("info.json")) {
  oldOutput = JSON.parse(readFileSync("info.json", "utf-8"));
}

for (let file of metadata) {
  if (!file.MIMEType.startsWith("audio/")) {
    console.log(`Skipped non audio file ${file.SourceFile}`);
    continue;
  }
  
  const artist = file.Artist ? file.Artist : "Unknown Artist";
  const album = file.Album ? file.Album : file.FileName;
  const title = file.Title ? file.Title : file.FileName;
  
  if (!output[artist]) {
    output[artist] = {};
  }
  
  if (!output[artist][album]) {
    output[artist][album] = [];
  }
  
  const trackNumber = file.TrackNumber ? parseInt(file.TrackNumber)-1 : output[artist][album].length;
  
  let picturePath = "";
  
  // If this track appears in the old info.json, skip handling the picture
  if (oldOutput[artist]?.[album]?.[trackNumber]?.title === title) {
    picturePath = oldOutput[artist][album][trackNumber].picture;
  } else {
    let picture = file.Picture ? execFileSync("exiftool", [ "-b", "-picture", file.SourceFile ]) : null;
    
    if (picture) {
      const hash = createHash("md5");
      hash.update(picture);
      picturePath = `pictures/${hash.digest("hex")}`;
      
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
    picture: picturePath !== "" ? picturePath : "pictures/no-picture.svg",
  };
  
  processedFiles++;
}

writeFileSync("info.json", JSON.stringify(output));

console.log(`Processed ${processedFiles} files, imported ${importedPictures} pictures.`);
