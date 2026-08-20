
"use strict";

// ---------------------------------------------------------------------
// ---------------------------------------------------------------------
//
// BLUETOOTH
//
// ---------------------------------------------------------------------
// ---------------------------------------------------------------------


const service_uuid = "0000ae30-0000-1000-8000-00805f9b34fb";
const tx_uuid = "0000ae01-0000-1000-8000-00805f9b34fb";
const rx_uuid = "0000ae02-0000-1000-8000-00805f9b34fb";


class dummy
{
  static writeValueWithoutResponse( array )
  {
    return new Promise( resolve => { console.log( "dummy write", array2string(array) ); resolve() } );
    //return new Promise( resolve => { resolve(); } );
  }
}


let tx_characteristic = null;
let rx_characteristic = null;

const buffer_mtu = 240;
let buffer_index = 0;
let buffer_data;
const buffer_delay = 70;


function delay( ms )
{
  return new Promise( resolve => setTimeout( resolve, ms ) );
}


function write_wrapper( write_array )
{
  if ( tx_characteristic !== null )
    return tx_characteristic.writeValueWithoutResponse( new Uint8Array( write_array ) );
  else
    throw new Error( "Cannot write, bluetooth is not properly set" );
}


function send_next_packet( resolve, reject )
{
  if ( buffer_index + buffer_mtu <= buffer_data.length )
  {
    write_wrapper( buffer_data.slice( buffer_index, buffer_index + buffer_mtu ) ) // send slice of mtu size and iterate
    .then( () =>
    {
      buffer_index += buffer_mtu;
      setTimeout( send_next_packet, buffer_delay, resolve, reject );
    })
    .catch( error => reject( error ) );
  }
  else
  {
    if ( buffer_index < buffer_data.length ) // Send the last bytes
    {
      write_wrapper( buffer_data.slice( buffer_index, buffer_data.length ) )
      .then( () => { setTimeout( resolve, buffer_delay ); })
      .catch( error => reject(error) );
    }
    else
      resolve();
  }
}


// ---------------------------------------------------------------------
// ---------------------------------------------------------------------
//
// PRINTER
//
// ---------------------------------------------------------------------
// ---------------------------------------------------------------------


function crc8( data )
{
  let crc = 0x00;

  for (const byte of data)
  {
    crc ^= byte;
    for (let d=0; d<8; d++)
    {
      if (crc & 0x80)
        crc = ((crc << 1) & 0xFF) ^ 0x07;
      else
        crc = ((crc << 1) & 0xFF);
    }
  }
  return crc;
}

function check_response( data )
{
  const payload = data.slice( 6, data.length-2 );

  if (( data[0] === 0x51 ) && 
      ( data[1] === 0x78 ) &&
      ( data[3] === 0x01 ) &&
      ( data[4] === data.length-8 ) &&
      ( data[5] === 0x00 ) &&
      ( data[data.length-2] === crc8( payload ) ) &&
      ( data[data.length-1] === 0xff ) )
  {
    console.log ( "* Command is:", data[2].toString(16), "with payload:", array2string( payload ) );

    if ( data[2] === 0xa3 )
      document.dispatchEvent( new CustomEvent( 'printerState', { "detail": payload } ) );

  }
  else
    console.log( "Error checking response", array2string( data ) );
}

function check_cmd( data )
{
  return ( data[0] === 0x51 ) && 
         ( data[1] === 0x78 ) &&
         ( data[3] === 0x00 ) &&
         ( data[4] === data.length-8 ) &&
         ( data[5] === 0x00 ) &&
         ( data[data.length-2] === crc8( data.slice( 6, data.length-2 ) ) ) &&
         ( data[data.length-1] === 0xff ) ;
}


function append ( byte_array, command_array ) // Append command to array
{
  if (check_cmd( command_array ))
    byte_array.push( ...command_array );
  else
    console.log( "Error in command (ignore it)", command_array );

  return byte_array;
}


function pack_line ( linedata ) // Convert one line into packed bits
{
  const payload_length = Math.ceil(linedata.length/8);
  const result = new Uint8Array( payload_length );
  for (let i=0, p=0; p<payload_length; p++)
  {
    result[p] = 0;
    for (let d=0; d<8; i++, d++)
    {
      if (linedata[i] !== 0 && linedata[i] !== 255) { console.log( "Warning, line data is not pure black and white" ) }; // DEBUG This should not happen
      if (linedata[i] < 128)
        result[p] |= (1 << d);
    }
  }
  return result;
}


function make_print_command( w, h, context_in )
{
  const byte_array = [];

  // Unknown command
  append( byte_array, [0x51, 0x78, 0xf2, 0x00, 0x02, 0x00, 0x01, 0xb4, 0x10, 0xff] );
  // Set quality  (0x34 = 52)
  append( byte_array, [0x51, 0x78, 0xa4, 0x00, 0x01, 0x00, 0x34, 0x8c, 0xff] );
  // Start lattice
  append( byte_array, [0x51, 0x78, 0xa6, 0x00, 0x0b, 0x00, 0xaa, 0x55, 0x17, 0x38, 0x44, 0x5f, 0x5f, 0x5f, 0x44, 0x38, 0x2c, 0xa1, 0xff] );
  // Set energy (0x2710 = 10000)
  append( byte_array, [0x51, 0x78, 0xaf, 0x00, 0x02, 0x00, 0x10, 0x27, 0xa2, 0xff] );
  // Print image
  append( byte_array, [0x51, 0x78, 0xbe, 0x00, 0x01, 0x00, 0x00, 0x00, 0xff] );
  // Set speed to 0x0a = 10
  append( byte_array, [0x51, 0x78, 0xbd, 0x00, 0x01, 0x00, 0x0a, 0x36, 0xff] );

  // Image data line by line
  const data = context_in.getImageData( 0, 0, w, h ).data;

  if ( w < h ) // portrait
  {
    for ( let y = 0; y < h; y++ )
    {
      const linedata = new Uint8Array(w);
      for ( let x = 0; x < w ; x++ )
        linedata[x] = data[(x + y*w)*4];
      const packed_bytes = pack_line( linedata );
      append( byte_array, [ 0x51, 0x78, 0xa2, 0x00, packed_bytes.length, 0x00, ...packed_bytes, crc8(packed_bytes), 0xff ] );
    }
  }
  else  // landscape
  {
    for ( let x = 0; x < w; x++ )
    {
      const linedata = new Uint8Array(h);
      for ( let y = 0; y < h; y++ )
        linedata[y] = data[(x + (h-y)*w)*4];
      const packed_bytes = pack_line( linedata );
      append( byte_array, [ 0x51, 0x78, 0xa2, 0x00, packed_bytes.length, 0x00, ...packed_bytes, crc8(packed_bytes), 0xff ] );
    }
  }

  // Set speed to 0x0a = 10
  append( byte_array, [0x51, 0x78, 0xbd, 0x00, 0x01, 0x00, 0x0a, 0x36, 0xff] );
  // Feed paper (0x30 = 48)
  append( byte_array, [0x51, 0x78, 0xa1, 0x00, 0x02, 0x00, 0x40, 0x00, 0x5b, 0xff] );
  // End lattice
  append( byte_array, [0x51, 0x78, 0xa6, 0x00, 0x0b, 0x00, 0xaa, 0x55, 0x17, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x17, 0x11, 0xff] );

  return byte_array;
}


function send_command( command_data)
{
  buffer_index = 0;
  buffer_data = command_data;
  return new Promise( (resolve, reject) => { send_next_packet( resolve, reject ); }) ;
}


function array2string( data )  // Print payload to console
{
  const literal_array = [];
  for ( const byte of data )
    literal_array.push( ('00' + byte.toString(16)).slice(-2) );
  return literal_array.join(':');
}


function check_device_state()
{
  return new Promise( (resolve, reject) =>
  {
    document.addEventListener( "printerState", (event) =>
    {
      if ( event.detail[0] === 0)
        resolve();
      else
        reject( "Printer is not ready" );
    }
    , { once: true } );

    send_bluetooth( append( [], [0x51, 0x78, 0xa3, 0x00, 0x01, 0x00, 0x00, 0x00, 0xff] ) )
    .catch( (error) => { reject( error ) } );
  } )
}



function send_bluetooth( command_data )
{
  return new Promise( (resolve, reject) =>
  {
    if (tx_characteristic === null)
    {
      navigator.bluetooth.requestDevice( { filters: [{ name: 'MX06'  }], optionalServices: [service_uuid] } )

      .then( device => device.gatt.connect() )

      .then( server => server.getPrimaryService( service_uuid ) )

      .then( service => Promise.all( [service.getCharacteristic(tx_uuid), service.getCharacteristic(rx_uuid)] ) )

      .then( ([tx, rx]) =>
      {
        tx_characteristic = tx; // Cache the characteristic
        rx_characteristic = rx; // Cache the characteristic
        return rx.startNotifications();
      } )

      .then( () => rx_characteristic.addEventListener('characteristicvaluechanged', (event) => { check_response( new Uint8Array( event.target.value.buffer ) ) } ) )

      .then( () => send_command( command_data ) )

      .then( resolve )

      .catch( (error) =>
      {
        tx_characteristic = null;
        reject( error );
      } );
    }
    else
    {
      send_command( command_data )

      .then( resolve )

      .catch( (error) =>
      {
        tx_characteristic = null;
        reject( error );
      } );
    }
  } );
}


