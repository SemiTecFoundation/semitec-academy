// top.sv — board top level for Lab 1
module top (
  input  logic       sysclk,
  input  logic       btn,      // push button = shift clock (after debouncing)
  input  logic       d_in,     // switch = serial input
  output logic [3:0] q         // LEDs
);
  logic btn_db, btn_db_q, shift_en;

  debounce #(.STABLE_CYCLES(1_000_000)) u_db (.clk(sysclk), .btn_in(btn), .btn_out(btn_db));

  // one-cycle pulse on the rising edge of the debounced button
  always_ff @(posedge sysclk) btn_db_q <= btn_db;
  assign shift_en = btn_db & ~btn_db_q;

  // TODO (step 4): use shift_en as a clock enable of the shift register
  //                instead of using the button as a clock
  shift4 u_sr (.clk(btn_db), .rst(1'b0), .d_in(d_in), .q(q));
endmodule
