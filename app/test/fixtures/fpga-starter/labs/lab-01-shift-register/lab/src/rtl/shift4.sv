// shift4.sv — 4-bit serial-in, parallel-out shift register (Lab 1, step 2)
module shift4 (
  input  logic       clk,
  input  logic       rst,
  input  logic       d_in,
  output logic [3:0] q
);
  // TODO: on reset clear q; otherwise shift left and take d_in into q[0]
  // always_ff @(posedge clk) ...
endmodule
