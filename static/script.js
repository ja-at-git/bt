
"use strict";

const PRINT_SIZE = 384;
const MAX_SIZE = 800;

let front = true;
let mode = "splash";

setInterval( () => { document.title = mode; } , 300);

const photo = document.getElementById( "photo" );
const splash = document.getElementById( "splash" );
const video = document.getElementById( "video" );

const canvas_webcam = document.createElement( "canvas" );
const context_webcam = canvas_webcam.getContext( "2d", {willReadFrequently: true} );
// Meilleure qualité lors du redimensionnement
context_webcam.imageSmoothingEnabled = true;
context_webcam.imageSmoothingQuality = "high";

const canvas_gray = document.createElement( "canvas" );
const context_gray = canvas_gray.getContext( "2d", {willReadFrequently: true} );
// Meilleure qualité lors du redimensionnement
context_gray.imageSmoothingEnabled = true;
context_gray.imageSmoothingQuality = "high";

const canvas_dither = document.createElement( "canvas" );
const context_dither = canvas_dither.getContext( "2d", {willReadFrequently: true} );
context_dither.imageSmoothingEnabled = false;


function set_photo( success_msg )
{
  mode = "loading";
  if ( success_msg )
    notyf.success( success_msg );

  convert2gray( context_webcam, canvas_webcam.width, canvas_webcam.height, context_gray );
  photo.setAttribute( "src", canvas_gray.toDataURL( "image/png" ) );

  splash.style.opacity = 0;
  video.style.opacity = 0;
  photo.style.opacity = 1;
  mode = "photo";
}

function set_video( success_msg )
{
  mode = "loading";
  if ( success_msg )
    notyf.success( success_msg );
  splash.style.opacity = 0;
  video.style.opacity = 1;
  photo.style.opacity = 0;
  mode = "video";
}

function set_splash( err_msg )
{
  mode = "loading";
  if ( err_msg )
    notyf.error( err_msg );
  splash.style.opacity = 1;
  video.style.opacity = 0;
  photo.style.opacity = 0;
  mode = "splash";
}

function set_dither( success_msg )
{
  mode = "loading";
  if ( success_msg )
    notyf.success( success_msg );

  convert2dither( canvas_gray, canvas_dither.width, canvas_dither.height, context_dither )
  photo.setAttribute( "src", canvas_dither.toDataURL( "image/png" ) );

  mode = "dither";
}

// ---------------------------------------------------------------------
// ---------------------------------------------------------------------
//
// TOAST
//
// ---------------------------------------------------------------------
// ---------------------------------------------------------------------


const notyf = new Notyf(
{
  duration: 1200,
  ripple: false,
  position: { x: 'center', y: 'bottom' }
} );


// ---------------------------------------------------------------------
//
// SWIPE
//
// ---------------------------------------------------------------------


let y0 = null;
let x0 = null;

window.addEventListener( "pointerdown", e=>
{
  e.preventDefault();

  x0 = e.clientX;
  y0 = e.clientY;

}, {passive:false});


window.addEventListener( "pointerup", e=>
{
  e.preventDefault();

  const dx = e.clientX-x0;
  const dy = e.clientY-y0;

  if( Math.abs(dy)>Math.abs(dx) ) // Vertical move
  {
    if( Math.abs(dy)>30 )
      swipeV( (dy<0), e.clientX/window.innerWidth );
    else 
      click();
  }
  else // Horizontal move
  {
    if( Math.abs(dx)>30 )
      swipeH( (dx<0), e.clientY/window.innerHeight );
    else
      click();
  }
}, {passive:false});


function click()
{
  document.documentElement.requestFullscreen().catch( (err) => { notyf.error( "Failed to enter full screen: " + err.message ); } );
  if ( mode==="splash" )
    start_video();
  else if ( mode==="video" )
    draw_webcam( video, video.videoWidth, video.videoHeight );
  else if ( mode==="photo" && video.readyState )
    set_video();
}

function adjust_param( param_name, param_setter, up )
{
  if ( mode==="photo" )
    set_photo( param_name + " is " + param_setter( up ).toString() );
  else
  {
    set_photo( param_name + " is " + param_setter( up ).toString() );
    set_dither();
  }
}


function swipeV( up, xpos )
{
  if ( mode==="photo" || mode==="dither" )
  {
    if ( xpos < 0.333 )
      if ( mode==="photo" )
        adjust_param( "Sharpness Gray", adjust_sharpnessG, up )
      else // mode==="dither"
        adjust_param( "Sharpness Dither", adjust_sharpnessD, up )
    else if ( xpos < 0.667 )
      adjust_param( "Constrast", adjust_contrast, up )
    else
      adjust_param( "Gamma", adjust_gamma, up )
  }
  else if ( mode==="video" )
  {
    front = !front; // Try to invert camera side
    start_video();
  }
  else if ( mode==="splash" )
  {
    mode = "loading";
    const input = document.createElement( "input" );
    input.type = "file";
    input.accept = "image/*";

    input.addEventListener( "change", (event) =>  
    {
      const reader = new FileReader();
      reader.onload = (e) =>
      {
        const img = new Image();
        img.onload = () => { draw_webcam(img, img.naturalWidth, img.naturalHeight); };
        img.src = e.target.result;
      };
      try
      { reader.readAsDataURL( event.target.files[0] ); }
      catch { (error) => notyf.error( "Error reading file" ) };
    } );
    input.addEventListener( "cancel", (event) => { set_splash( "File selection was cancelled" ) });
    input.click();
  }
}


function swipeH( left, ypos )
{
  if ( mode==="splash" )
  {
    if ( left )
      start_video();
  }
  else if ( mode==="video" )
  {
    if ( left )
      draw_webcam( video, video.videoWidth, video.videoHeight );
    else
    {
      stop_video();
      set_splash();
    }
  }
  else if ( mode==="photo" )
  {
    if ( left )
      set_dither();
    else
    { 
      if ( video.readyState )
        set_video();
      else
        set_splash();
    }
  }
  else if ( mode==="dither" )
  {
    if ( ypos < 0.20 )
      set_dither( "Threshold is " + adjust_threshold( left ).toString() );
    else if ( ypos < 0.60 )
      set_dither( "Algo is " + change_algo( left ) );
    else
    {
      if ( left )
        print_bluetooth();
      else
        set_photo();
    }
  }
}


// ---------------------------------------------------------------------
// ---------------------------------------------------------------------
//
// VIDEO
//
// ---------------------------------------------------------------------
// ---------------------------------------------------------------------


function start_video() {

  mode = "loading";

  stop_video(); // required before trying to access another camera

  if ( navigator.mediaDevices && navigator.mediaDevices.getUserMedia )
  {
    navigator.mediaDevices.getUserMedia( { video: { facingMode: front ? "user" : "environment" }, audio: false } )
    .then( (stream) =>
    {
      video.srcObject = stream;
      return video.play();
    } )
    .then ( () => { set_video( "Resolution is " + video.videoWidth.toString() + "x" + video.videoHeight.toString() ); } )
    .catch( (err) => { set_splash( `Failed to access camera: ${err.message}` ); } );
  }
  else
    set_splash( "Your browser does not support camera capture!" );
}


function stop_video()
{
  if ( video.srcObject != null )
    video.srcObject.getTracks().forEach( (track) => { track.stop(); });
  video.srcObject = null;
}

function draw_webcam(img, w, h)
{
  const scale = Math.min( 1, Math.max( MAX_SIZE/w, MAX_SIZE/h ) );
  w = Math.round( w*scale );
  h = Math.round( h*scale );

  const rotation = (w > h) !== (window.innerWidth > window.innerHeight); // image orientation is different from screen orientation
  const landscape_screen = (window.innerWidth > window.innerHeight);

  if (rotation)
  {
    canvas_webcam.width = h;
    canvas_webcam.height = w;
    context_webcam.save();

    if ( landscape_screen )
    {
      context_webcam.translate( h, 0 );
      context_webcam.rotate( Math.PI/2 );
    }
    else
    {
      context_webcam.translate( 0, w );
      context_webcam.rotate( -Math.PI/2 );
    }

    context_webcam.drawImage( img, 0, 0, w, h );
    context_webcam.restore();
  }
  else
  {
    canvas_webcam.width = w;
    canvas_webcam.height = h;
    context_webcam.drawImage( img, 0, 0, w, h );
  }

  canvas_gray.width = canvas_webcam.width;
  canvas_gray.height = canvas_webcam.height;

  if ( landscape_screen )
  {
    canvas_dither.width = Math.round( PRINT_SIZE * canvas_webcam.width/canvas_webcam.height );
    canvas_dither.height = PRINT_SIZE;
  }
  else  // portrait screen
  {
    canvas_dither.width = PRINT_SIZE;
    canvas_dither.height = Math.round( PRINT_SIZE * canvas_webcam.height/canvas_webcam.width );
  }

  set_photo();
}


function orient_webcam()
{
  const w = canvas_webcam.width;
  const h = canvas_webcam.height;

  const rotation = (w > h) !== (window.innerWidth > window.innerHeight); // image orientation is different from screen orientation
  const landscape_screen = (window.innerWidth > window.innerHeight);

  if (rotation)
  {
    context_gray.drawImage( canvas_webcam, 0, 0, w, h ); // Copy image into gray context (used as temp buffer)

    canvas_webcam.width = h;
    canvas_webcam.height = w;
    context_webcam.save();

    if ( landscape_screen )
    {
      context_webcam.translate( h, 0 );
      context_webcam.rotate( Math.PI/2 );

      canvas_dither.width = Math.round( PRINT_SIZE*h/w );
      canvas_dither.height = PRINT_SIZE;
    }
    else
    {
      context_webcam.translate( 0, w );
      context_webcam.rotate( -Math.PI/2 );

      canvas_dither.width = PRINT_SIZE;
      canvas_dither.height = Math.round( PRINT_SIZE*w/h );
    }

    context_webcam.drawImage( canvas_gray, 0, 0, w, h ); // Put back original image from gray context used as temp buffer
    context_webcam.restore();

    canvas_gray.width = h;
    canvas_gray.height = w;

    if ( mode==="photo" )
    { set_photo( "Orientation modified" ); }
    else if ( mode==="dither" )
    {
      set_photo( "Orientation modified" );
      set_dither();
    }

  }
}

window.addEventListener( "resize", orient_webcam );

// ---------------------------------------------------------------------
// ---------------------------------------------------------------------
//
// BLUETOOTH
//
// ---------------------------------------------------------------------
// ---------------------------------------------------------------------


function print_bluetooth()
{ 
  if ( navigator.bluetooth && navigator.bluetooth.requestDevice )
  {
    mode = "bluetooth";

    check_device_state()
    .then( () => delay( 400 ) )
    .then( () => send_bluetooth( make_print_command( canvas_dither.width, canvas_dither.height, context_dither ) ) )
    .then( () => delay( 400 ) )
    .then( () => { notyf.success( "Successful write to printer" ); } )

    .catch( (err) => { notyf.error( "Bluetooth error: " + err.message ); } )

    .finally( () => { set_dither(); } );
  }
  else
    notyf.error( "Your browser does not support bluetooth!" );
}


