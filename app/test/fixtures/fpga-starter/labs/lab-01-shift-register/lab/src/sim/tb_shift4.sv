// tb_shift4.sv — self-checking testbench for shift4 (Lab 1, step 3)
`timescale 1ns/1ps
module tb_shift4;
  logic clk = 0, rst = 1, d_in = 0;
  logic [3:0] q;

  shift4 dut (.*);
  always #5 clk = ~clk;            // 100 MHz

  task automatic shift_in(input logic b);
    d_in = b;
    @(posedge clk); #1;
  endtask

  initial begin
    repeat (2) @(posedge clk);
    rst = 0;
    shift_in(1); shift_in(0); shift_in(1); shift_in(1);
    assert (q == 4'b1011) else $error("q = %b, expected 1011", q);
    $display("TEST %s", (q == 4'b1011) ? "PASSED" : "FAILED");
    $finish;
  end
endmodule
