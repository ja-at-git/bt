
"use strict";

// ---------------------------------------------------------------------
// ---------------------------------------------------------------------
//
// GRAYSCALE IMAGE
//
// ---------------------------------------------------------------------
// ---------------------------------------------------------------------


let contrast = 1;
let gamma = 1;
let sharpnessG = 0;
let sharpnessD = 0;

function adjust_contrast( up )
{
  contrast = up ? contrast*1.05 : contrast/1.05;
  return contrast.toFixed(2);
}

function adjust_gamma( up )
{
  gamma = up ? gamma/1.05 : gamma*1.05;
  return gamma.toFixed(2);
}

function adjust_sharpnessG( up )
{
  sharpnessG += up ? +0.10 : -0.10;
  return sharpnessG.toFixed(2);
}

function adjust_sharpnessD( up )
{
  sharpnessD += up ? +0.02 : -0.02;
  return sharpnessD.toFixed(2);
}

function convert2gray( context_in, w, h, context_out )
{
  const imageData = context_in.getImageData( 0, 0, w, h );
  const data = imageData.data;

  /* RGB → gris */
  let gray = toGrayscale( data, w, h );
  /* Égalisation */
  gray = clahe( gray, w, h );
  /* Contraste + Luminosité */
  gray = adjustContrastGamma( gray, contrast, gamma );
  /* Netteté avant réduction. */
  gray = sharpen( gray, w, h, sharpnessG );

  grayToData( gray, data );
  context_out.putImageData( imageData, 0, 0 );
}


/* ============================================================
   UTILITAIRES
   ============================================================ */

function clamp( value, min = 0, max = 255 )
{
  return Math.max( min, Math.min( max, value ) );
}


/* ============================================================
   RGB → NIVEAUX DE GRIS
   ============================================================ */

function toGrayscale( data, w, h )
{
  const gray = new Float32Array( w*h );

  for ( let i = 0, p = 0; i < data.length; i += 4, p++ )
    gray[p] = 0.299*data[i] + 0.587*data[i + 1] + 0.114*data[i + 2];

  return gray;
}


/* ============================================================
   CONTRASTE / LUMINOSITÉ
   ============================================================ */

function adjustContrastGamma( gray, contrast, gamma )
{
  for ( let i = 0; i < gray.length; i++ )
  {
    gray[i] = clamp( (gray[i] - 128) *  contrast + 128 );
    gray[i] = clamp( Math.pow( gray[i]/255, gamma ) * 255 );
  }

  return gray;
}


/* ============================================================
   NETTETÉ
   ============================================================ */

function sharpen( gray, width, height, amount )
{
  const result = new Float32Array(gray);

  for ( let y = 1; y < height - 1; y++ )
  {
    for ( let x = 1; x < width - 1; x++ )
    {
      const i = y*width + x;
      const detail = 4*gray[i] - ( gray[i - width] + gray[i + width] + gray[i - 1] + gray[i + 1] );

      result[i] = clamp( gray[i] + detail*amount*4 );
    }
  }
  return result;
}


/* ============================================================
   CLAHE
   ============================================================ */

function clahe( gray, width, height )
{

  const tilesX = 8;
  const tilesY = 8;
  const clipLimit = 2;

  const result = new Float32Array( gray.length );
  const tileWidth = width/tilesX;
  const tileHeight = height/tilesY;
  const luts = new Array( tilesX * tilesY );

  /* Construction des LUT locales */
  for ( let ty = 0; ty < tilesY; ty++ )
  {
    const y0 = Math.floor( ty*tileHeight );
    const y1 = Math.floor( (ty + 1)*tileHeight );

    for ( let tx = 0; tx < tilesX; tx++ )
    {
      const x0 = Math.floor( tx*tileWidth );
      const x1 = Math.floor( (tx + 1)*tileWidth );
      const histogram = new Uint32Array(256);
      let pixelCount = 0;

      for ( let y = y0; y < y1; y++ )
      {
        for ( let x = x0; x < x1; x++ )
        {
          const value = Math.round( clamp( gray[y*width + x] ) );
          histogram[value]++;
          pixelCount++;
        }
      }

      const absoluteClipLimit = Math.max( 1, Math.floor( clipLimit * pixelCount / 256 ) );
      let excess = 0;

      for ( let i = 0; i < 256; i++ )
      {
        if ( histogram[i] > absoluteClipLimit )
        {
          excess += histogram[i] - absoluteClipLimit;
          histogram[i] = absoluteClipLimit;
        }
      }

      const redistribution = Math.floor( excess/256 );

      let remainder = excess%256;

      for ( let i = 0; i < 256; i++ )
      {
        histogram[i] += redistribution;

        if (remainder > 0)
        {
          histogram[i]++;
          remainder--;
        }
      }

      /* LUT */
      const lut = new Uint8Array(256);
      let cumulative = 0;

      for ( let i = 0; i < 256; i++ )
      {
        cumulative += histogram[i];
        lut[i] = Math.round( 255*cumulative/pixelCount );
      }

      luts[ty*tilesX + tx] = lut;
    }
  }

  /* Interpolation bilinéaire */
  for ( let y = 0; y < height; y++ )
  {
    const gy = y/tileHeight - 0.5;
    let ty0 = Math.floor( gy );
    let ty1 = ty0 + 1;
    const fy = gy - ty0;

    ty0 = clamp( ty0, 0, tilesY - 1 );
    ty1 = clamp( ty1, 0, tilesY - 1 );

    for ( let x = 0; x < width; x++ )
    {
      const gx = x/tileWidth - 0.5;
      let tx0 = Math.floor( gx );
      let tx1 = tx0 + 1;
      const fx = gx - tx0;

      tx0 = clamp( tx0, 0, tilesX - 1 );
      tx1 = clamp( tx1, 0, tilesX - 1 );

      const value = Math.round( clamp( gray[y*width + x] ) );
      const lut00 = luts[ty0*tilesX + tx0][value];
      const lut10 = luts[ty0*tilesX + tx1][value];
      const lut01 = luts[ty1*tilesX + tx0][value];
      const lut11 = luts[ty1*tilesX + tx1][value];

      const top = lut00*(1 - fx) + lut10*fx;
      const bottom = lut01*(1 - fx) + lut11*fx;

      result[y*width + x] = top*(1 - fy) + bottom*fy;
    }
  }

  return result;
}


/* ============================================================
   CRÉATION D'UN CANVAS DEPUIS UN TABLEAU GRIS
   ========================================================== */

function grayToData( gray, data)
{
  for ( let i = 0; i < gray.length; i++ )
  {
    const value = Math.round( clamp( gray[i] ) );

    data[i*4] = value;
    data[i*4 + 1] = value;
    data[i*4 + 2] = value;
    data[i*4 + 3] = 255;
  }
}



// ---------------------------------------------------------------------
// ---------------------------------------------------------------------
//
// DITHER
//
// ---------------------------------------------------------------------
// ---------------------------------------------------------------------


let threshold = 128; // Used only for threshold algorithm

let index_algo= 1 ;

const algorithmes=
[
  { id:"threshold",   nom:"Threshold" },
  { id:"floyd",       nom:"Floyd-Steinberg" },
  { id:"atkinson",    nom:"Atkinson" },
  { id:"burkes",      nom:"Burkes" },
  { id:"sierra",      nom:"Sierra" },
  { id:"tworow",      nom:"Two-Row Sierra" },
  { id:"stucki",      nom:"Stucki" },
  { id:"jarvis",      nom:"Jarvis-Judice-Ninke" },
  { id:"bayer4",      nom:"Bayer 4x4" },
  { id:"bayer8",      nom:"Bayer 8x8" }
];

const matrices=
{
  threshold:[],

  floyd:[
                           [1,0,7/16],
    [-1,1,3/16],[0,1,5/16],[1,1,1/16]
  ],

  atkinson:[
                         [1,0,1/8],[2,0,1/8],
    [-1,1,1/8],[0,1,1/8],[1,1,1/8],
               [0,2,1/8]
  ],

  burkes:[
                                       [1,0,8/32],[2,0,4/32],
    [-2,1,2/32],[-1,1,4/32],[0,1,8/32],[1,1,4/32],[2,1,2/32]
  ],

  stucki:[
                                       [1,0,8/42],[2,0,4/42],
    [-2,1,2/42],[-1,1,4/42],[0,1,8/42],[1,1,4/42],[2,1,2/42],
    [-2,2,1/42],[-1,2,2/42],[0,2,4/42],[1,2,2/42],[2,2,1/42]
  ],

  jarvis:[
                                       [1,0,7/48],[2,0,5/48],
    [-2,1,3/48],[-1,1,5/48],[0,1,7/48],[1,1,5/48],[2,1,3/48],
    [-2,2,1/48],[-1,2,3/48],[0,2,5/48],[1,2,3/48],[2,2,1/48]
  ],

  sierra:[
                                       [1,0,5/32],[2,0,3/32],
    [-2,1,2/32],[-1,1,4/32],[0,1,5/32],[1,1,4/32],[2,1,2/32],
    [-1,2,2/32],[0,2,3/32],[1,2,2/32]
  ],

  tworow:[
                                       [1,0,4/16],[2,0,3/16],
    [-2,1,1/16],[-1,1,2/16],[0,1,3/16],[1,1,2/16],[2,1,1/16]
  ],

  bayer4:[
    [0, 8, 2, 10],
    [12, 4, 14, 6],
    [3, 11, 1, 9],
    [15, 7, 13, 5]
  ],

  bayer8:[
    [0, 32, 8, 40, 2, 34, 10, 42],
    [48, 16, 56, 24, 50, 18, 58, 26],
    [12, 44, 4, 36, 14, 46, 6, 38],
    [60, 28, 52, 20, 62, 30, 54, 22],
    [3, 35, 11, 43, 1, 33, 9, 41],
    [51, 19, 59, 27, 49, 17, 57, 25],
    [15, 47, 7, 39, 13, 45, 5, 37],
    [63, 31, 55, 23, 61, 29, 53, 21]
  ]
};

function adjust_threshold( left )
{
  threshold += left ? +8 : -8;
  threshold = clamp( threshold );
  return threshold;
}

function change_algo( left )
{
  index_algo += left ? -1 : +1;

  if( index_algo<0 )
    index_algo=algorithmes.length-1;

  if( index_algo>=algorithmes.length )
    index_algo=0;

  return algorithmes[index_algo].nom;
}


function convert2dither( canvas_in, w, h, context_out )
{
  context_out.drawImage( canvas_in, 0, 0, w, h ); // Copy image and resize
  const imageData = context_out.getImageData( 0, 0, w, h );
  const data = imageData.data;

  let gris = toGrayscale( data, w, h );

  /* Netteté après réduction. */
  gris = sharpen( gris, w, h, sharpnessD );

  const algo = algorithmes[index_algo].id;

  if( algo==="bayer4" || algo==="bayer8")
    gris = bayer( gris, w, h, threshold,  matrices[algo] )
  else
  {
    const matrice = matrices[algo];

    for( let y=0; y<h; y++ )
    {
      const reverse = (y%2 === 1);

      for( let n = 0; n < w; n++ )
      {
        const x = reverse ? w - 1 - n : n;

        const i = x + y*w;
        const oldPixel = gris[i];
        const newPixel = oldPixel<threshold ? 0 : 255;
        const err = oldPixel-newPixel;
        gris[i] = newPixel;

        for( const [dx,dy,coef] of matrice )
        {
          const nx = reverse? x-dx : x+dx;
          const ny = y+dy;

          if ( nx>=0 && nx<w && ny>=0 && ny<h )
            gris[ny*w + nx] += err*coef;
        }
      }
    }
  }
  grayToData( gris, data );
  context_out.putImageData( imageData, 0, 0 );
}


function bayer( gray, width, height, threshold, matrix)
{
  const size = matrix.length;
  const result = new Float32Array( width*height );

  for (let y = 0; y < height; y++)
  {
    for (let x = 0; x < width; x++)
    {
        const value = clamp( gray[y*width + x] );
        /* Valeur du seuil Bayer normalisée. */
        const pattern = ( matrix[y%size][x%size] + 0.5 )/(size*size);
        /* On conserve le seuil global comme réglage de luminosité. 128 correspond au seuil neutre. */
        const localThreshold = threshold + (pattern - 0.5) * 255;

        result[y*width + x] = value < localThreshold ? 0 : 255;
    }
  }
  return result;
}


